/**
 * Extraction job handler — runs in the worker process.
 * Reads the upload session, calls Gemini, writes enriched data back.
 */
import path from 'node:path';
import { readSession, writeSession, uploadsDir } from './sessions.js';
import { extractInvoice, type GenerateFn } from './extract.js';
import { annotateLineItems } from './unit-bridge.js';

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
	if (message.includes('invalid JSON')) return 'extract.err.notInvoice';
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

	const dir = uploadsDir();
	const filePath = path.join(dir, session.files[0]);

	await writeSession({ ...session, extractionStatus: 'extracting' });

	try {
		const result = await extractInvoice(filePath, generateOverride);

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
	}
}
