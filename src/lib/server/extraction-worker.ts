import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as Sentry from '@sentry/sveltekit';
import { uploadsDir } from './sessions.js';
import { getItem, markExtracting, markDone, markFailed } from './batch.js';
import { getStorage } from './storage.js';
import { STORAGE_DRIVER } from './env.js';
import { extractInvoice, extractWithProvider, type GenerateFn } from './extract.js';
import { annotateLineItems } from './products.js';
import { checkExtractionQuota, claimMonthlyExtraction, releaseMonthlyExtraction, recordLlmUsage } from './llm-quota.js';
import { getAccessState } from './billing.js';
import { recordDeadLetter } from './dead-letter.js';
import { EXTRACTION_QUEUE } from './queue.js';
import { acquireExtractionSlot } from './rate-limiter.js';

export interface ExtractionJobData {
	itemId?: string;
	sessionId?: string;
	restaurantId: string;
}

const DEGRADATION_ERRORS = new Set([
	'extract.err.rateLimited',
	'extract.err.unavailable',
	'extract.err.timeout',
]);

function classifyExtractionError(err: unknown): string {
	const status = (err as { status?: number }).status;
	const message = (err as { message?: string }).message ?? '';
	const code = (err as { code?: string }).code;
	const name = (err as { name?: string }).name;
	if (status === 429) return 'extract.err.rateLimited';
	if (status === 503) return 'extract.err.unavailable';
	if (
		code === 'GEMINI_TIMEOUT' ||
		code === 'ABORT_ERR' ||
		code === 'ETIMEDOUT' ||
		name === 'AbortError' ||
		name === 'TimeoutError'
	) return 'extract.err.timeout';
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
		console.warn('[worker] Job without itemId — routing to the dead-letter queue');
		await recordDeadLetter({
			queue: EXTRACTION_QUEUE,
			errorClass: 'corrupt.missingItemId',
			error: new Error('Extraction job carries neither itemId nor sessionId'),
			restaurantId: restaurantId || null,
			payload: jobData,
		});
		return;
	}

	const item = await getItem(itemId);
	if (!item) {
		console.warn(`[worker] Batch item ${itemId} not found — routing to the dead-letter queue`);
		await recordDeadLetter({
			queue: EXTRACTION_QUEUE,
			errorClass: 'corrupt.itemNotFound',
			error: new Error(`Batch item ${itemId} referenced by the job no longer exists`),
			restaurantId: restaurantId || null,
			sourceId: itemId,
			payload: jobData,
		});
		return;
	}

	let claimedMonthlySlot = false;
	if (!generateOverride) {
		const access = await getAccessState(restaurantId);
		if (!access.allowed) {
			console.warn(`[worker] Subscription inactive for tenant ${restaurantId} (${access.status}) — refusing extraction`);
			await markFailed(itemId, access.trialExpired ? 'extract.err.trialExpired' : 'extract.err.subscriptionInactive');
			return;
		}

		const quotaResult = await checkExtractionQuota(restaurantId);
		if (!quotaResult.allowed) {
			console.warn(`[worker] Quota exceeded for tenant ${restaurantId}: ${quotaResult.reason}`);
			await markFailed(itemId, 'extract.err.quotaExceeded');
			return;
		}

		const claim = await claimMonthlyExtraction(restaurantId);
		if (!claim.claimed) {
			console.warn(`[worker] Monthly plan quota reached for tenant ${restaurantId} (limit ${claim.limit})`);
			Sentry.captureMessage('extraction.quota_exhausted', {
				level: 'warning',
				tags: { restaurantId },
			});
			await markFailed(itemId, 'extract.err.quotaExceeded');
			return;
		}
		claimedMonthlySlot = true;
	}

	const claimed = await markExtracting(itemId);
	if (!claimed) {
		console.warn(`[worker] Item ${itemId} not in queued state — skipping`);
		if (claimedMonthlySlot) await releaseMonthlyExtraction(restaurantId);
		return;
	}

	let filePath: string;
	let cleanupTmp: (() => void) | null = null;

	if (STORAGE_DRIVER !== 'local') {
		const buf = await getStorage().read(item.fileKey);
		const tmpPath = path.join(os.tmpdir(), `mep_${itemId}_${path.basename(item.fileKey)}`);
		fs.writeFileSync(tmpPath, buf);
		filePath = tmpPath;
		cleanupTmp = () => { try { fs.unlinkSync(tmpPath); } catch { } };
	} else {
		filePath = path.join(uploadsDir(), item.fileKey);
	}

	try {
		let result;
		const slot = await acquireExtractionSlot();
		try {
			if (generateOverride) {
				const invoice = await extractInvoice(filePath, generateOverride);
				result = invoice;
			} else {
				const { invoice, usage } = await extractWithProvider(filePath);
				result = invoice;
				await recordLlmUsage(restaurantId, usage, 'extraction-worker');
			}
		} finally {
			await slot.release();
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
		if (DEGRADATION_ERRORS.has(extractError)) {
			Sentry.captureException(err, {
				level: 'warning',
				tags: { errorClass: extractError, restaurantId },
			});
		} else {
			Sentry.captureException(new Error(`extraction_failed:${extractError}`), {
				level: 'error',
				tags: { itemId, errorClass: extractError, restaurantId },
			});
			await recordDeadLetter({
				queue: EXTRACTION_QUEUE,
				errorClass: extractError,
				error: err,
				restaurantId,
				sourceId: itemId,
				payload: { ...jobData, fileKey: item.fileKey, displayName: item.displayName },
			});
		}
		await markFailed(itemId, extractError);
		if (claimedMonthlySlot) await releaseMonthlyExtraction(restaurantId);
	} finally {
		cleanupTmp?.();
	}
}
