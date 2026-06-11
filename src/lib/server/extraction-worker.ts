/**
 * Extraction job handler — runs in the worker process.
 * Reads the upload session, calls Gemini, writes enriched data back.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { readSession, writeSession, uploadsDir } from './sessions.js';
import { getStorage } from './storage.js';
import { STORAGE_DRIVER } from './env.js';
import { extractInvoice, extractWithProvider, type GenerateFn } from './extract.js';
import { annotateLineItems } from './unit-bridge.js';
import { checkExtractionQuota, recordLlmUsage } from './llm-quota.js';

export interface ExtractionJobData {
	sessionId: string;
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
	const { sessionId, restaurantId } = jobData;

	const session = await readSession(sessionId);
	if (!session) {
		console.warn(`[worker] Session ${sessionId} not found — skipping`);
		return;
	}

	const key = session.fileKeys?.[0] ?? session.files[0];

	// Check per-tenant quota before doing any work (skip in test path).
	if (!generateOverride) {
		const quotaResult = await checkExtractionQuota(restaurantId);
		if (!quotaResult.allowed) {
			console.warn(`[worker] Quota exceeded for tenant ${restaurantId}: ${quotaResult.reason}`);
			await writeSession({ ...session, extractionStatus: 'failed', extractError: 'extract.err.quotaExceeded' });
			return;
		}
	}

	await writeSession({ ...session, extractionStatus: 'extracting' });

	// Resolve the file to a local path the extraction engine can read.
	// For Supabase storage, download to a temp file; for local, compute the path directly.
	let filePath: string;
	let cleanupTmp: (() => void) | null = null;

	if (STORAGE_DRIVER === 'supabase') {
		const buf = await getStorage().read(key);
		const tmpPath = path.join(os.tmpdir(), `mep_${sessionId}_${path.basename(key)}`);
		fs.writeFileSync(tmpPath, buf);
		filePath = tmpPath;
		cleanupTmp = () => { try { fs.unlinkSync(tmpPath); } catch { /* ignore */ } };
	} else {
		filePath = path.join(uploadsDir(), key);
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
			line_items: enriched.map((item) => ({
				description: item.description,
				quantity: item.quantity,
				unit: item.unit,
				unit_price: item.unitPrice,
				total_price: item.totalPrice,
				canonical_unit: item.canonicalUnit,
				requires_unit_conversion: item.requiresUnitConversion,
				confidence: (item as Record<string, unknown>).itemConfidence,
			})),
		};

		await writeSession({
			...session,
			extractedData,
			conversionNotes,
			extractionStatus: 'done',
			extractError: undefined,
		});

		console.info(`[worker] Extraction done for session ${sessionId}`);
	} catch (err) {
		const extractError = classifyExtractionError(err);
		console.error(`[worker] Extraction failed for session ${sessionId}:`, err);
		await writeSession({ ...session, extractionStatus: 'failed', extractError });
		// Do not re-throw — we store the error in the session; no pg-boss retry.
	} finally {
		cleanupTmp?.();
	}
}
