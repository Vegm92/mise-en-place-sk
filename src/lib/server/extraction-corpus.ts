import { and, asc, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PostgresJsDatabase, PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { batchItems, extractionResults } from './schema';
import { db } from './db';
import { forTenant } from './tenant';

export type CorpusDb =
	| PostgresJsDatabase<typeof schema>
	| PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type ExtractionRunKind = 'live' | 'replay';

export const EXTRACTION_CORPUS_RETENTION_DAYS = 730;

export const UNRECORDED_PROMPT_VERSION = 'unrecorded';

export interface ExtractionResultInput {
	restaurantId: string;
	batchItemId: string | null;
	fileKey: string;
	displayName?: string | null;
	source?: string;
	runKind?: ExtractionRunKind;
	promptVersion: string;
	model?: string | null;
	extractedData: Record<string, unknown>;
	conversionNotes?: string[] | null;
}

export interface CorpusEntry {
	id: string;
	restaurantId: string;
	batchItemId: string | null;
	fileKey: string;
	displayName: string | null;
	source: string;
	runKind: string;
	promptVersion: string;
	model: string | null;
	extractedData: Record<string, unknown>;
	confidence: number | null;
	createdAt: Date | null;
}

const entryColumns = {
	id: extractionResults.id,
	restaurantId: extractionResults.restaurantId,
	batchItemId: extractionResults.batchItemId,
	fileKey: extractionResults.fileKey,
	displayName: extractionResults.displayName,
	source: extractionResults.source,
	runKind: extractionResults.runKind,
	promptVersion: extractionResults.promptVersion,
	model: extractionResults.model,
	extractedData: extractionResults.extractedData,
	confidence: extractionResults.confidence,
	createdAt: extractionResults.createdAt,
};

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fieldConfidences(data: Record<string, unknown>): Record<string, number> | null {
	const raw = data.field_confidences;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const out: Record<string, number> = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		const n = asNumber(value);
		if (n !== null) out[key] = n;
	}
	return Object.keys(out).length ? out : null;
}

function toInsertRow(input: ExtractionResultInput): typeof extractionResults.$inferInsert {
	return {
		restaurantId: input.restaurantId,
		batchItemId: input.batchItemId,
		fileKey: input.fileKey,
		displayName: input.displayName ?? null,
		source: input.source ?? 'web',
		runKind: input.runKind ?? 'live',
		promptVersion: input.promptVersion,
		model: input.model ?? null,
		extractedData: input.extractedData,
		fieldConfidences: fieldConfidences(input.extractedData),
		confidence: asNumber(input.extractedData.confidence),
		conversionNotes: input.conversionNotes ?? null,
		totalMismatch: input.extractedData.total_mismatch === true,
	};
}

export async function recordExtractionResult(
	input: ExtractionResultInput,
	dbc: CorpusDb = db,
): Promise<string | null> {
	const rows = await dbc
		.insert(extractionResults)
		.values(toInsertRow(input))
		.returning({ id: extractionResults.id });
	return rows.length ? rows[0].id : null;
}

export async function archiveBatchExtractions(dbc: CorpusDb = db): Promise<number> {
	// tenant-scope-ok: retention job, deliberately cross-tenant — it copies the
	// raw extraction of every tenant's already-extracted items into the corpus
	// before the batch sweep deletes the batch rows, and each copied row keeps
	// the item's own restaurant_id.
	const pending = await dbc
		.select({
			id: batchItems.id,
			restaurantId: batchItems.restaurantId,
			fileKey: batchItems.fileKey,
			displayName: batchItems.displayName,
			source: batchItems.source,
			extractedData: batchItems.extractedData,
			conversionNotes: batchItems.conversionNotes,
		})
		.from(batchItems)
		.leftJoin(extractionResults, eq(extractionResults.batchItemId, batchItems.id))
		.where(and(isNotNull(batchItems.extractedData), isNull(extractionResults.id)))
		.limit(1000);

	if (!pending.length) return 0;

	const rows = pending.map((item) => toInsertRow({
		restaurantId: item.restaurantId,
		batchItemId: item.id,
		fileKey: item.fileKey,
		displayName: item.displayName,
		source: item.source,
		promptVersion: UNRECORDED_PROMPT_VERSION,
		extractedData: (item.extractedData ?? {}) as Record<string, unknown>,
		conversionNotes: (item.conversionNotes ?? null) as string[] | null,
	}));

	const inserted = await dbc
		.insert(extractionResults)
		.values(rows)
		.returning({ id: extractionResults.id });
	return inserted.length;
}

export async function pruneExtractionCorpus(
	dbc: CorpusDb = db,
	retentionDays = EXTRACTION_CORPUS_RETENTION_DAYS,
): Promise<number> {
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
	// tenant-scope-ok: retention job, deliberately cross-tenant — deletes corpus
	// rows for every restaurant by age, the RGPD storage-limitation control for
	// this table (ADR-034).
	const deleted = await dbc
		.delete(extractionResults)
		.where(lt(extractionResults.createdAt, cutoff))
		.returning({ id: extractionResults.id });
	return deleted.length;
}

export interface CorpusQuery {
	restaurantId?: string;
	promptVersion?: string;
	runKind?: ExtractionRunKind;
	limit?: number;
}

export async function listCorpusEntries(query: CorpusQuery = {}, dbc: CorpusDb = db): Promise<CorpusEntry[]> {
	const filters = [
		query.promptVersion ? eq(extractionResults.promptVersion, query.promptVersion) : undefined,
		eq(extractionResults.runKind, query.runKind ?? 'live'),
	].filter(Boolean);

	const where = query.restaurantId
		? forTenant(query.restaurantId).scope(extractionResults.restaurantId, and(...filters))
		: and(...filters);

	// tenant-scope-ok: prompt-evaluation read used by the offline replay tool —
	// scoped by `forTenant` when a restaurant is named, and deliberately
	// cross-tenant when none is, because the corpus is the evaluation set for
	// the extraction prompt itself.
	const rows = await dbc
		.select(entryColumns)
		.from(extractionResults)
		.where(where)
		.orderBy(desc(extractionResults.createdAt))
		.limit(query.limit ?? 50);
	return rows as CorpusEntry[];
}

export async function corpusEntriesForFile(
	restaurantId: string,
	fileKey: string,
	dbc: CorpusDb = db,
): Promise<CorpusEntry[]> {
	const tdb = forTenant(restaurantId);
	const rows = await dbc
		.select(entryColumns)
		.from(extractionResults)
		.where(tdb.scope(extractionResults.restaurantId, eq(extractionResults.fileKey, fileKey)))
		.orderBy(asc(extractionResults.createdAt));
	return rows as CorpusEntry[];
}

export interface PromptVersionStat {
	promptVersion: string;
	runKind: string;
	documents: number;
	avgConfidence: number | null;
	totalMismatches: number;
	firstSeen: Date | null;
	lastSeen: Date | null;
}

export async function promptVersionStats(dbc: CorpusDb = db): Promise<PromptVersionStat[]> {
	// tenant-scope-ok: prompt-quality rollup over the whole corpus, the point of
	// which is comparing prompt revisions across every document ever read; it
	// returns aggregates only, never a tenant's rows.
	const rows = await dbc
		.select({
			promptVersion: extractionResults.promptVersion,
			runKind: extractionResults.runKind,
			documents: sql<number>`count(*)`,
			avgConfidence: sql<number | null>`avg(${extractionResults.confidence})`,
			totalMismatches: sql<number>`count(*) filter (where ${extractionResults.totalMismatch})`,
			firstSeen: sql<string | null>`min(${extractionResults.createdAt})`,
			lastSeen: sql<string | null>`max(${extractionResults.createdAt})`,
		})
		.from(extractionResults)
		.groupBy(extractionResults.promptVersion, extractionResults.runKind)
		.orderBy(desc(sql`max(${extractionResults.createdAt})`));

	return rows.map((r) => ({
		promptVersion: r.promptVersion,
		runKind: r.runKind,
		documents: Number(r.documents),
		avgConfidence: r.avgConfidence == null ? null : Number(r.avgConfidence),
		totalMismatches: Number(r.totalMismatches),
		firstSeen: r.firstSeen ? new Date(r.firstSeen) : null,
		lastSeen: r.lastSeen ? new Date(r.lastSeen) : null,
	}));
}

export const COMPARED_FIELDS = [
	'supplier_name',
	'supplier_nif',
	'supplier_category',
	'invoice_number',
	'document_type',
	'invoice_date',
	'due_date',
	'total_amount',
	'tax_base',
	'currency',
	'line_count',
	'line_descriptions',
	'line_totals',
] as const;

export type ComparedField = (typeof COMPARED_FIELDS)[number];

export interface FieldDiff {
	field: ComparedField;
	baseline: string | number | null;
	candidate: string | number | null;
	equal: boolean;
}

function normalizeText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim().toLowerCase().replace(/\s+/g, ' ');
	return trimmed.length ? trimmed : null;
}

function normalizeMoney(value: unknown): number | null {
	const n = typeof value === 'string' ? Number(value) : value;
	return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function lineItems(data: Record<string, unknown>): Array<Record<string, unknown>> {
	const raw = data.line_items;
	return Array.isArray(raw) ? raw.filter((l): l is Record<string, unknown> => !!l && typeof l === 'object') : [];
}

function fieldValue(data: Record<string, unknown>, field: ComparedField): string | number | null {
	if (field === 'line_count') return lineItems(data).length;
	if (field === 'line_descriptions') {
		const descriptions = lineItems(data).map((l) => normalizeText(l.description) ?? '');
		return descriptions.length ? descriptions.join(' | ') : null;
	}
	if (field === 'line_totals') {
		const totals = lineItems(data)
			.map((l) => normalizeMoney(l.total_price))
			.filter((n): n is number => n !== null);
		if (!totals.length) return null;
		return Math.round(totals.reduce((a, b) => a + b, 0) * 100) / 100;
	}
	if (field === 'total_amount' || field === 'tax_base') return normalizeMoney(data[field]);
	return normalizeText(data[field]);
}

export function diffExtractions(
	baseline: Record<string, unknown>,
	candidate: Record<string, unknown>,
): FieldDiff[] {
	return COMPARED_FIELDS.map((field) => {
		const a = fieldValue(baseline, field);
		const b = fieldValue(candidate, field);
		return { field, baseline: a, candidate: b, equal: a === b };
	});
}

export interface FieldAgreement {
	field: ComparedField;
	compared: number;
	matched: number;
	rate: number | null;
}

export interface ComparisonSummary {
	documents: number;
	fields: FieldAgreement[];
	changedDocuments: number;
}

export function summarizeComparisons(perDocument: FieldDiff[][]): ComparisonSummary {
	const compared = new Map<ComparedField, { compared: number; matched: number }>();
	for (const field of COMPARED_FIELDS) compared.set(field, { compared: 0, matched: 0 });

	let changedDocuments = 0;
	for (const diffs of perDocument) {
		if (diffs.some((d) => !d.equal)) changedDocuments++;
		for (const diff of diffs) {
			const bucket = compared.get(diff.field)!;
			bucket.compared++;
			if (diff.equal) bucket.matched++;
		}
	}

	return {
		documents: perDocument.length,
		changedDocuments,
		fields: COMPARED_FIELDS.map((field) => {
			const bucket = compared.get(field)!;
			return {
				field,
				compared: bucket.compared,
				matched: bucket.matched,
				rate: bucket.compared ? Math.round((bucket.matched / bucket.compared) * 1000) / 10 : null,
			};
		}),
	};
}

const PII_FIELDS = ['supplier_email', 'supplier_phone', 'supplier_nif', 'supplier_address'] as const;

export function anonymizeExtraction(data: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = { ...data };
	for (const field of PII_FIELDS) {
		if (out[field] != null) out[field] = typeof out[field] === 'string' && (out[field] as string).length ? '[redacted]' : null;
	}
	if (typeof out.qr_url === 'string') out.qr_url = '[redacted]';
	return out;
}
