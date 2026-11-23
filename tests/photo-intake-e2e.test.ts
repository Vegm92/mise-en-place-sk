/**
 * In-app photo intake end to end, with no provider call (campaign mise, C5).
 *
 * Drives the same chain the `/?/upload` action and the worker run for a phone
 * photo: saveUploadedFiles -> createBatch -> enqueueBatchExtraction ->
 * runExtractionWorkflow (the injected GenerateFn stands in for Gemini; the
 * real provider is never built) -> the batch review `save` action's
 * saveReviewedInvoice. Asserts a factura and an albarán without prices each
 * land as an `invoices` row with the right `document_type`.
 *
 * DB-backed; skipped without a local DATABASE_URL.
 */
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { hasDbEnv, testSql } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import { saveUploadedFiles, uploadsDir } from '../src/lib/server/sessions';
import { createBatch, getItem, getBatchItems, markQueued, createBatchStore } from '../src/lib/server/batch';
import { enqueueBatchExtraction } from '../src/lib/server/extract-batch';
import { runExtractionWorkflow } from '../src/lib/server/extraction-workflow';
import { extractInvoice, type GenerateFn } from '../src/lib/server/extract';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';

const FIXTURES = new URL('./fixtures/photo-intake/', import.meta.url);
const photo = (name: string) => new File([readFileSync(new URL(name, FIXTURES))], name, { type: 'image/jpeg' });
const providerResponse = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf-8');

const FACTURA_RESPONSE = providerResponse('factura.provider-response.json');
const ALBARAN_RESPONSE = providerResponse('albaran-sin-precios.provider-response.json');

function replyWith(text: string) {
	return vi.fn<GenerateFn>(async () => text);
}

type Extracted = {
	supplier_name: string; invoice_number: string; invoice_date: string; total_amount: number | null; confidence: number;
	line_items: Array<{ description: string; quantity: number | null; unit: string | null; unit_price: number | null; total_price: number | null }>;
};

function reviewFormFrom(extracted: Extracted): FormData {
	const fd = new FormData();
	fd.append('supplier_name', extracted.supplier_name);
	fd.append('invoice_number', extracted.invoice_number);
	fd.append('invoice_date', extracted.invoice_date);
	fd.append('total_amount', extracted.total_amount === null ? '' : String(extracted.total_amount));
	fd.append('confidence', String(extracted.confidence));
	for (const l of extracted.line_items) {
		fd.append('line_descriptions', l.description);
		fd.append('line_quantities', String(l.quantity ?? ''));
		fd.append('line_units', l.unit ?? '');
		fd.append('line_unit_prices', l.unit_price === null ? '' : String(l.unit_price));
		fd.append('line_total_prices', l.total_price === null ? '' : String(l.total_price));
		fd.append('line_tax_rates', '');
	}
	return fd;
}

const namespaces: string[] = [];

async function uploadPhotos(names: string[], namespace: string) {
	const scoped = `${namespace}-${randomUUID()}`;
	namespaces.push(scoped);
	return saveUploadedFiles(names.map(photo), scoped);
}

afterEach(() => { vi.restoreAllMocks(); });

afterAll(() => {
	for (const ns of namespaces) rmSync(path.join(uploadsDir(), ns), { recursive: true, force: true });
});

describe('albarán without prices — provider response fixture (no DB)', () => {
	it('lands as document_type albaran with a null total and its lines intact', async () => {
		const { keys } = await uploadPhotos(['albaran.jpg'], 'golden');
		const generate = replyWith(ALBARAN_RESPONSE);
		const invoice = await extractInvoice(path.join(uploadsDir(), keys[0]!), generate);

		expect(generate).toHaveBeenCalledOnce();
		expect(invoice.document_type).toBe('albaran');
		expect(invoice.total_amount).toBeNull();
		expect(invoice.line_items.map((l) => [l.description, l.quantity, l.unit_price])).toEqual([
			['Tomate pera', 12, null],
			['Lechuga romana', 20, null],
		]);
	});

	it('sends the photo to the provider as an inline image part', async () => {
		const { keys } = await uploadPhotos(['factura.jpg'], 'golden-mime');
		const generate = replyWith(FACTURA_RESPONSE);
		await extractInvoice(path.join(uploadsDir(), keys[0]!), generate);
		const [content] = generate.mock.calls[0]!;
		expect(content).toEqual([{ inlineData: { data: expect.any(String), mimeType: 'image/jpeg' } }]);
	});
});

const restaurant = useTestRestaurant('photo-intake');
const USER_ID = randomUUID();

describe.skipIf(!hasDbEnv)('photo -> batch -> invoice row, provider mocked', () => {
	it('turns one factura photo and one albarán photo into two invoice rows with the right document_type', async () => {
		const rid = restaurant.id;
		const enqueued: Array<[string, string]> = [];
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled in photo-intake e2e'));
		const { saved, keys, errors } = await uploadPhotos(['factura.jpg', 'albaran.jpg'], 'photo-e2e');
		expect(errors).toEqual([]);
		expect(saved.map((n) => n.split('_')[0])).toEqual(['factura', 'albaran']);

		const { batchId, itemIds } = await createBatch(rid, saved.map((name, i) => ({ key: keys[i]!, name })));
		await enqueueBatchExtraction(itemIds[0]!, rid, {
			getItem, getBatchItems, markQueued,
			enqueue: async (id, extractionRid) => { enqueued.push([id, extractionRid]); return true; },
		});
		expect(enqueued).toEqual(itemIds.map((id) => [id, rid]));
		expect((await getBatchItems(batchId)).map((i) => i.status)).toEqual(['queued', 'queued']);

		const replies = [replyWith(FACTURA_RESPONSE), replyWith(ALBARAN_RESPONSE)];
		for (const [i, itemId] of itemIds.entries()) {
			const outcome = await runExtractionWorkflow({ itemId, restaurantId: rid }, replies[i]);
			expect(outcome).toBe('completed');
			expect(replies[i]).toHaveBeenCalledOnce();
		}

		const done = await getBatchItems(batchId);
		expect(done.map((i) => i.status)).toEqual(['done', 'done']);
		expect(done.map((i) => i.extractedData?.document_type)).toEqual(['factura', 'albaran']);

		for (const item of done) {
			const outcome = await saveReviewedInvoice(
				item,
				reviewFormFrom(item.extractedData as unknown as Extracted),
				rid,
				USER_ID,
				async (tx) => { await createBatchStore(tx).markConfirmed(item.id); },
			);
			expect(outcome.type).toBe('saved');
		}

		const rows = await testSql`
			SELECT i.invoice_number, i.document_type, i.total_amount, i.source_file,
			       (SELECT count(*)::int FROM invoice_line_items l WHERE l.invoice_id = i.id) AS lines
			FROM invoices i WHERE i.restaurant_id = ${rid} ORDER BY i.invoice_number
		`;
		expect(rows.map((r) => ({ ...r }))).toEqual([
			{ invoice_number: 'ALB-2026-0092', document_type: 'albaran', total_amount: null, source_file: keys[1], lines: 2 },
			{ invoice_number: 'F-2026-0417', document_type: 'factura', total_amount: '121.00', source_file: keys[0], lines: 2 },
		]);
		expect((await getBatchItems(batchId)).map((i) => i.status)).toEqual(['confirmed', 'confirmed']);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});
