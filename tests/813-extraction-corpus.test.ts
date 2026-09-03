/**
 * Extraction corpus (#813) — the durable record of every document read.
 *
 * Two invariants: the raw extraction of a confirmed document survives the 24h
 * batch sweep that used to cascade it away, and the corpus carries the prompt
 * version each result was produced with, so two revisions of the prompt can be
 * compared over documents that were really processed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { createBatchStore } from '../src/lib/server/batch';
import {
	recordExtractionResult, listCorpusEntries, corpusEntriesForFile, promptVersionStats,
	pruneExtractionCorpus, diffExtractions, summarizeComparisons, anonymizeExtraction,
	UNRECORDED_PROMPT_VERSION, EXTRACTION_CORPUS_RETENTION_DAYS, COMPARED_FIELDS,
} from '../src/lib/server/extraction-corpus';
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_PROMPT_REVISION } from '../src/lib/server/extract';

let rid = '';
const store = hasDbEnv ? createBatchStore(testDb) : null!;

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('corpus')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

function fakeStorage() {
	return { deletedKeys: [] as string[], async delete(key: string) { this.deletedKeys.push(key); } };
}

async function backdateBatch(batchId: string, hoursAgo: number) {
	await testSql`UPDATE upload_batches SET created_at = now() - ${`${hoursAgo} hours`}::interval WHERE id = ${batchId}`;
}

const BASELINE = {
	supplier_name: 'Frutas García S.L.',
	supplier_nif: 'B12345678',
	supplier_email: 'pedidos@frutasgarcia.es',
	supplier_phone: '600123456',
	invoice_number: 'F-2026-118',
	document_type: 'factura',
	invoice_date: '2026-08-14',
	due_date: null,
	total_amount: 231.55,
	tax_base: 210.5,
	currency: 'EUR',
	confidence: 0.91,
	field_confidences: { supplier_name: 0.97, total_amount: 0.88 },
	line_items: [
		{ description: 'Tomate rama', quantity: 10, unit: 'kg', unit_price: 1.55, total_price: 15.5 },
		{ description: 'Cebolla', quantity: 25, unit: 'kg', unit_price: 7.8, total_price: 195 },
	],
} satisfies Record<string, unknown>;

describe('prompt version', () => {
	it('is a stable fingerprint of the prompt text, tagged with its revision', () => {
		expect(EXTRACTION_PROMPT_VERSION.startsWith(`${EXTRACTION_PROMPT_REVISION}-`)).toBe(true);
		expect(EXTRACTION_PROMPT_VERSION).toMatch(/^v\d+-[0-9a-f]{12}$/);
	});
});

describe('diffExtractions', () => {
	it('reports every compared field and flags only what actually changed', () => {
		const candidate = { ...BASELINE, total_amount: 231.56, invoice_number: 'F-2026-118' };
		const diffs = diffExtractions(BASELINE, candidate);

		expect(diffs).toHaveLength(COMPARED_FIELDS.length);
		expect(diffs.filter(d => !d.equal).map(d => d.field)).toEqual(['total_amount']);
	});

	it('ignores whitespace and case in text fields, and cent-equal money', () => {
		const candidate = { ...BASELINE, supplier_name: '  FRUTAS   GARCÍA S.L. ', total_amount: 231.5500001 };
		expect(diffExtractions(BASELINE, candidate).every(d => d.equal)).toBe(true);
	});

	it('catches a dropped or reordered line item through the line fields', () => {
		const candidate = { ...BASELINE, line_items: BASELINE.line_items.slice(0, 1) };
		const changed = diffExtractions(BASELINE, candidate).filter(d => !d.equal).map(d => d.field);
		expect(changed).toContain('line_count');
		expect(changed).toContain('line_descriptions');
		expect(changed).toContain('line_totals');
	});

	it('summarizes per-field agreement across documents', () => {
		const identical = diffExtractions(BASELINE, BASELINE);
		const changed = diffExtractions(BASELINE, { ...BASELINE, invoice_number: 'F-2026-119' });
		const summary = summarizeComparisons([identical, changed]);

		expect(summary.documents).toBe(2);
		expect(summary.changedDocuments).toBe(1);
		expect(summary.fields.find(f => f.field === 'invoice_number')).toMatchObject({ compared: 2, matched: 1, rate: 50 });
		expect(summary.fields.find(f => f.field === 'supplier_name')).toMatchObject({ compared: 2, matched: 2, rate: 100 });
	});
});

describe('anonymizeExtraction', () => {
	it('masks supplier contact details before the corpus leaves the tenant boundary', () => {
		const anonymized = anonymizeExtraction(BASELINE);
		expect(anonymized.supplier_email).toBe('[redacted]');
		expect(anonymized.supplier_phone).toBe('[redacted]');
		expect(anonymized.supplier_nif).toBe('[redacted]');
		expect(anonymized.supplier_name).toBe(BASELINE.supplier_name);
		expect(anonymized.line_items).toEqual(BASELINE.line_items);
		expect(BASELINE.supplier_email).toBe('pedidos@frutasgarcia.es');
	});

	it('masks the receiver contact fields too (issue #918)', () => {
		const withReceiverContact = { ...BASELINE, receiver_email: 'restaurante@example.es', receiver_phone: '600123456' };
		const anonymized = anonymizeExtraction(withReceiverContact);
		expect(anonymized.receiver_email).toBe('[redacted]');
		expect(anonymized.receiver_phone).toBe('[redacted]');
		expect(withReceiverContact.receiver_email).toBe('restaurante@example.es');
	});
});

describe.skipIf(!hasDbEnv)('corpus persistence', () => {
	it('keeps a confirmed item\'s raw extraction after the 24h sweep deletes its batch (#813)', async () => {
		const { batchId, itemIds } = await store.createBatch(rid, [{ key: 'ns/corpus-a.pdf', name: 'a.pdf' }]);
		await store.markQueued(itemIds[0]);
		await store.markExtracting(itemIds[0]);
		await store.markDone(itemIds[0], BASELINE, ['nota']);
		await store.markConfirmed(itemIds[0]);

		await recordExtractionResult({
			restaurantId: rid,
			batchItemId: itemIds[0],
			fileKey: 'ns/corpus-a.pdf',
			displayName: 'a.pdf',
			promptVersion: EXTRACTION_PROMPT_VERSION,
			model: 'gemini-test',
			extractedData: BASELINE,
			conversionNotes: ['nota'],
		}, testDb);

		await backdateBatch(batchId, 25);
		await store.cleanupStaleBatches(fakeStorage());

		expect(await store.getBatchItems(batchId)).toEqual([]);

		const entries = await corpusEntriesForFile(rid, 'ns/corpus-a.pdf', testDb);
		const recorded = entries.find(e => e.promptVersion === EXTRACTION_PROMPT_VERSION);
		expect(recorded).toBeDefined();
		expect(recorded!.batchItemId).toBeNull();
		expect(recorded!.confidence).toBeCloseTo(0.91, 5);
		expect((recorded!.extractedData as typeof BASELINE).line_items).toHaveLength(2);

		const [row] = await testSql`
			SELECT field_confidences FROM extraction_results
			WHERE file_key = 'ns/corpus-a.pdf' AND prompt_version = ${EXTRACTION_PROMPT_VERSION}
		`;
		expect(row.field_confidences).toEqual({ supplier_name: 0.97, total_amount: 0.88 });
	});

	it('archives an extraction the worker never recorded rather than letting the sweep destroy it', async () => {
		const { batchId, itemIds } = await store.createBatch(rid, [{ key: 'ns/corpus-b.pdf', name: 'b.pdf' }]);
		await store.markQueued(itemIds[0]);
		await store.markExtracting(itemIds[0]);
		await store.markDone(itemIds[0], BASELINE, []);
		await backdateBatch(batchId, 25);

		await store.cleanupStaleBatches(fakeStorage());

		const entries = await corpusEntriesForFile(rid, 'ns/corpus-b.pdf', testDb);
		expect(entries).toHaveLength(1);
		expect(entries[0].promptVersion).toBe(UNRECORDED_PROMPT_VERSION);
		expect(entries[0].batchItemId).toBeNull();
	});

	it('lists live entries per tenant and groups the corpus by prompt version', async () => {
		await recordExtractionResult({
			restaurantId: rid,
			batchItemId: null,
			fileKey: 'ns/corpus-c.pdf',
			displayName: 'c.pdf',
			runKind: 'replay',
			promptVersion: 'v9-replayfixture',
			extractedData: BASELINE,
		}, testDb);

		const live = await listCorpusEntries({ restaurantId: rid, limit: 50 }, testDb);
		expect(live.every(e => e.runKind === 'live')).toBe(true);
		expect(live.every(e => e.restaurantId === rid)).toBe(true);

		const replays = await listCorpusEntries({ restaurantId: rid, runKind: 'replay', limit: 50 }, testDb);
		expect(replays.map(e => e.fileKey)).toContain('ns/corpus-c.pdf');

		const stats = await promptVersionStats(testDb);
		const fixture = stats.find(s => s.promptVersion === 'v9-replayfixture' && s.runKind === 'replay');
		expect(fixture?.documents).toBeGreaterThanOrEqual(1);
		expect(fixture!.lastSeen).toBeInstanceOf(Date);
		expect(fixture!.avgConfidence).toBeCloseTo(0.91, 5);
	});

	it('prunes corpus rows past the retention window, and keeps the ones inside it', async () => {
		await recordExtractionResult({
			restaurantId: rid,
			batchItemId: null,
			fileKey: 'ns/corpus-old.pdf',
			promptVersion: 'v0-retention',
			extractedData: BASELINE,
		}, testDb);
		await testSql`
			UPDATE extraction_results
			SET created_at = now() - ${`${EXTRACTION_CORPUS_RETENTION_DAYS + 1} days`}::interval
			WHERE file_key = 'ns/corpus-old.pdf'
		`;

		const pruned = await pruneExtractionCorpus(testDb);
		expect(pruned).toBeGreaterThanOrEqual(1);
		expect(await corpusEntriesForFile(rid, 'ns/corpus-old.pdf', testDb)).toEqual([]);
		expect((await corpusEntriesForFile(rid, 'ns/corpus-a.pdf', testDb)).length).toBeGreaterThanOrEqual(1);
	});

	it('is deleted with its restaurant, so the corpus never outlives the tenant', async () => {
		const other = await createTestRestaurant('corpus-del');
		await recordExtractionResult({
			restaurantId: other.id,
			batchItemId: null,
			fileKey: 'ns/corpus-tenant.pdf',
			promptVersion: EXTRACTION_PROMPT_VERSION,
			extractedData: BASELINE,
		}, testDb);

		await cleanupTestRestaurant(other.id);

		const rows = await testSql`SELECT id FROM extraction_results WHERE file_key = 'ns/corpus-tenant.pdf'`;
		expect(rows).toHaveLength(0);
	});
});
