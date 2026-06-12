/**
 * Extraction job handler — runs in the worker process.
 * Claims the batch item via a guarded queued→extracting transition, calls
 * Gemini, and writes the result with markDone/markFailed. The worker only
 * ever touches the columns it owns; web-side state can never be lost here.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { uploadsDir } from './sessions.js';
import { getItem, markExtracting, markDone, markFailed } from './batch.js';
import { getStorage } from './storage.js';
import { STORAGE_DRIVER } from './env.js';
import { extractInvoice, extractWithProvider, type GenerateFn } from './extract.js';
import { annotateLineItems } from './unit-bridge.js';
import { checkExtractionQuota, recordLlmUsage } from './llm-quota.js';

export interface ExtractionJobData {
	itemId?: string;
	/** Legacy payload field — jobs enqueued before the batch_items migration. */
	sessionId?: string;
	restaurantId: string;
}

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

	// Check per-tenant quota before doing any work (skip in test path).
	if (!generateOverride) {
		const quotaResult = await checkExtractionQuota(restaurantId);
		if (!quotaResult.allowed) {
			console.warn(`[worker] Quota exceeded for tenant ${restaurantId}: ${quotaResult.reason}`);
			await markFailed(itemId, 'extract.err.quotaExceeded');
			return;
		}
	}

	// Claim the item. A false here means it is no longer queued (discarded by
	// the user, or already processed) — drop the job without side effects.
	const claimed = await markExtracting(itemId);
	if (!claimed) {
		console.warn(`[worker] Item ${itemId} not in queued state — skipping`);
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
		await markFailed(itemId, extractError);
		// Do not re-throw — the error is stored on the item; no pg-boss retry.
	} finally {
		cleanupTmp?.();
	}
}
