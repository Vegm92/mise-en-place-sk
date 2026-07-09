/**
 * Extraction job handler — runs in the worker process.
 * Claims the batch item via a guarded queued→extracting transition, calls
 * Gemini, and writes the result with markDone/markFailed. The worker only
 * ever touches the columns it owns; web-side state can never be lost here.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as Sentry from '@sentry/sveltekit';
import { uploadsDir } from './sessions.js';
import { getItem, markExtracting, markDone, markFailed } from './batch.js';
import { getStorage } from './storage.js';
import { STORAGE_DRIVER } from './env.js';
import { extractInvoice, extractWithProvider, type GenerateFn } from './extract.js';
import { annotateLineItems } from './unit-bridge.js';
import { checkExtractionQuota, claimMonthlyExtraction, releaseMonthlyExtraction, recordLlmUsage } from './llm-quota.js';

export interface ExtractionJobData {
	itemId?: string;
	/** Legacy payload field — jobs enqueued before the batch_items migration. */
	sessionId?: string;
	restaurantId: string;
}

// Transient LLM-degradation classes worth alerting on when they spike.
const DEGRADATION_ERRORS = new Set([
	'extract.err.rateLimited',
	'extract.err.unavailable',
	'extract.err.timeout',
]);

function classifyExtractionError(err: unknown): string {
	const status = (err as { status?: number }).status;
	const message = (err as { message?: string }).message ?? '';
	const code = (err as { code?: string }).code;
	if (status === 429) return 'extract.err.rateLimited';
	if (status === 503) return 'extract.err.unavailable';
	if (code === 'GEMINI_TIMEOUT') return 'extract.err.timeout';
	if (message.includes('invalid JSON') || message.includes('LLM returned invalid JSON')) return 'extract.err.notInvoice';
	return 'extract.err.generic';
}

export async function processExtractionJob(
	jobData: ExtractionJobData,
	generateOverride?: GenerateFn,
): Promise<void> {
	const itemId = jobData.itemId ?? jobData.sessionId;
	const { restaurantId } = jobData;
	if (!itemId) {
		console.warn('[worker] Job without itemId — skipping');
		return;
	}

	const item = await getItem(itemId);
	if (!item) {
		console.warn(`[worker] Batch item ${itemId} not found — skipping`);
		return;
	}

	// Money gate: atomically claim a monthly extraction slot against the plan
	// quota BEFORE any Gemini spend (issue #244). Skipped in the test path.
	let claimedMonthlySlot = false;
	if (!generateOverride) {
		const quotaResult = await checkExtractionQuota(restaurantId);
		if (!quotaResult.allowed) {
			console.warn(`[worker] Quota exceeded for tenant ${restaurantId}: ${quotaResult.reason}`);
			await markFailed(itemId, 'extract.err.quotaExceeded');
			return;
		}

		const claim = await claimMonthlyExtraction(restaurantId);
		if (!claim.claimed) {
			console.warn(`[worker] Monthly plan quota reached for tenant ${restaurantId} (limit ${claim.limit})`);
			// Aggregate quota exhaustion (was a lone console.warn) so a tenant
			// hitting the wall is visible, not only discovered from support (#257).
			Sentry.captureMessage('extraction.quota_exhausted', {
				level: 'warning',
				tags: { restaurantId },
			});
			await markFailed(itemId, 'extract.err.quotaExceeded');
			return;
		}
		claimedMonthlySlot = true;
	}

	// Claim the item. A false here means it is no longer queued (discarded by
	// the user, or already processed) — drop the job and release the slot we
	// took, since no extraction happened.
	const claimed = await markExtracting(itemId);
	if (!claimed) {
		console.warn(`[worker] Item ${itemId} not in queued state — skipping`);
		if (claimedMonthlySlot) await releaseMonthlyExtraction(restaurantId);
		return;
	}

	// Resolve the file to a local path the extraction engine can read.
	// For Supabase storage, download to a temp file; for local, compute the path directly.
	let filePath: string;
	let cleanupTmp: (() => void) | null = null;

	if (STORAGE_DRIVER === 'supabase') {
		const buf = await getStorage().read(item.fileKey);
		const tmpPath = path.join(os.tmpdir(), `mep_${itemId}_${path.basename(item.fileKey)}`);
		fs.writeFileSync(tmpPath, buf);
		filePath = tmpPath;
		cleanupTmp = () => { try { fs.unlinkSync(tmpPath); } catch { /* ignore */ } };
	} else {
		filePath = path.join(uploadsDir(), item.fileKey);
	}

	try {
		let result;
		if (generateOverride) {
			// Test path — legacy GenerateFn, no token tracking.
			const invoice = await extractInvoice(filePath, generateOverride);
			result = invoice;
		} else {
			// Production path — LLMProvider with token usage tracking.
			const { invoice, usage } = await extractWithProvider(filePath);
			result = invoice;
			await recordLlmUsage(restaurantId, usage, 'extraction-worker');
		}

		const supplierName = result.supplier_name ?? '';
		const rawItems = result.line_items ?? [];
		const lineItems = rawItems.map((i) => ({
			description: i.description ?? '',
			quantity: i.quantity ?? null,
			unit: i.unit ?? null,
			unitPrice: i.unit_price ?? null,
			totalPrice: i.total_price ?? null,
			itemConfidence: typeof i.confidence === 'number' ? i.confidence : undefined,
		}));

		const { enriched, conversionNotes } = await annotateLineItems(supplierName, lineItems, restaurantId);

		const extractedData: Record<string, unknown> = {
			...result,
			line_items: enriched.map((li) => ({
				description: li.description,
				quantity: li.quantity,
				unit: li.unit,
				unit_price: li.unitPrice,
				total_price: li.totalPrice,
				canonical_unit: li.canonicalUnit,
				requires_unit_conversion: li.requiresUnitConversion,
				confidence: (li as Record<string, unknown>).itemConfidence,
			})),
		};

		await markDone(itemId, extractedData, conversionNotes);
		console.info(`[worker] Extraction done for item ${itemId}`);
	} catch (err) {
		const extractError = classifyExtractionError(err);
		console.error(`[worker] Extraction failed for item ${itemId}:`, err);
		// Tag Gemini degradation (timeout / 429 / 503) with its errorClass so an
		// alert rule can catch a rate spike — "Gemini timing out for 2 hours"
		// must not look like one flaky PDF (#257). Activates once the worker
		// process initializes Sentry (#252); a no-op until then.
		if (DEGRADATION_ERRORS.has(extractError)) {
			Sentry.captureException(err, {
				level: 'warning',
				tags: { errorClass: extractError, restaurantId },
			});
		}
		await markFailed(itemId, extractError);
		// A failed extraction shouldn't count against the plan quota — give the
		// claimed slot back (issue #244).
		if (claimedMonthlySlot) await releaseMonthlyExtraction(restaurantId);
		// Do not re-throw — the error is stored on the item; no pg-boss retry.
	} finally {
		cleanupTmp?.();
	}
}
