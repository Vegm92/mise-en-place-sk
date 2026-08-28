/**
 * End-to-end trigger-chain verification for issue #570: does saving a newly
 * extracted invoice actually fire supplier and product auto-classification,
 * and do the results land in the database?
 *
 * Existing suites prove each link in isolation — invoice-save-category.test.ts
 * (issue #384) proves the supplier side end-to-end, product-categorizer.test.ts
 * proves the categorize-product job persists a verdict once it runs — but
 * nothing asserted that saveReviewedInvoice actually calls enqueueNormalize /
 * enqueueCategorize for a brand-new product. This file closes that gap: it
 * spies on the queue module to pin the enqueue call, then runs the real job
 * handler (with a fake LLM provider) against the productId the enqueue call
 * received, so the whole save → enqueue → job → persisted-category chain is
 * exercised in one place.
 *
 * DB-backed; the db singleton is swapped for the test client (ssl:'require'
 * in db.ts does not speak to local Postgres). Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

const { enqueueNormalizeMock, enqueueCategorizeMock } = vi.hoisted(() => ({
	enqueueNormalizeMock: vi.fn().mockResolvedValue(true),
	enqueueCategorizeMock: vi.fn().mockResolvedValue(true),
}));
vi.mock('../src/lib/server/queue', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/queue')>();
	return { ...actual, enqueueNormalize: enqueueNormalizeMock, enqueueCategorize: enqueueCategorizeMock };
});

import { saveReviewedInvoice } from '../src/lib/server/invoice-save';
import { processCategorizeJob } from '../src/lib/server/products';
import type { createGeminiProvider } from '../src/lib/server/llm-provider';
import { UNCATEGORIZED_CATEGORY } from '../src/lib/constants';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

type LLMProvider = ReturnType<typeof createGeminiProvider>;

function fakeProvider(text: string): LLMProvider {
	return {
		model: 'test-model',
		generate: async () => ({ text, usage: { inputTokens: 10, outputTokens: 5, model: 'test-model' } }),
	};
}

function extractedItem(data: Record<string, unknown>) {
	return { extractedData: data } as unknown as Parameters<typeof saveReviewedInvoice>[0];
}

function form(supplier: string, lines: Array<{ desc: string; unit: string; price: string }>): FormData {
	const fd = new FormData();
	fd.append('supplier_name', supplier);
	fd.append('invoice_number', `INV-${Math.random().toString(36).slice(2, 8)}`);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', '100');
	fd.append('low_confidence_ack', 'true');
	for (const l of lines) {
		fd.append('line_descriptions', l.desc);
		fd.append('line_quantities', '1');
		fd.append('line_units', l.unit);
		fd.append('line_unit_prices', l.price);
		fd.append('line_total_prices', l.price);
		fd.append('line_tax_rates', '');
	}
	return fd;
}

async function supplierCategoryFor(invoiceId: number): Promise<string | null> {
	const rows = await testSql`
		SELECT s.category FROM suppliers s
		JOIN invoices i ON i.supplier_id = s.id
		WHERE i.id = ${invoiceId}`;
	return rows[0]?.category ?? null;
}

async function productCategoryOf(productId: number): Promise<string | null> {
	const [row] = await testSql`SELECT category FROM products WHERE id = ${productId}`;
	return (row?.category as string | null) ?? null;
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('570-classifier')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('issue #570 — new-invoice classifier trigger chain', () => {
	it('a new invoice with a new supplier and a new product triggers both classifiers, and both persist', async () => {
		enqueueNormalizeMock.mockClear();
		enqueueCategorizeMock.mockClear();

		const supplierName = 'Frutas y Hortalizas del Sur, S.L.';
		const item = extractedItem({
			supplier_name: supplierName,
			supplier_category: 'Frutas y Verduras',
			field_confidences: { supplier_category: 0.9 },
			confidence: 0.9,
		});

		const out = await saveReviewedInvoice(item, form(supplierName, [
			{ desc: 'Naranja de zumo 570', unit: 'kg', price: '1.50' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		// 1. Supplier classification is synchronous, part of the save itself —
		// no queue involved — and the result is already persisted.
		expect(await supplierCategoryFor(out.invoiceId)).toBe('Frutas y Verduras');

		// 2. Product classification is NOT synchronous: the new product is
		// created uncategorised, and a separate pg-boss job is enqueued to
		// classify it.
		const [item1] = await testSql`
			SELECT product_id FROM invoice_line_items WHERE invoice_id = ${out.invoiceId}`;
		const productId = item1.product_id as number;
		expect(await productCategoryOf(productId)).toBeNull();

		expect(enqueueCategorizeMock).toHaveBeenCalledTimes(1);
		expect(enqueueCategorizeMock).toHaveBeenCalledWith(rid, productId, 'Naranja de zumo 570');
		expect(enqueueNormalizeMock).toHaveBeenCalledTimes(1);
		expect(enqueueNormalizeMock).toHaveBeenCalledWith(rid, productId, 'Naranja de zumo 570');

		// 3. Run the job the save enqueued (with a fake LLM so no real Gemini
		// call is made) and confirm the verdict actually lands on the product
		// the trigger named — closing the loop end to end.
		await processCategorizeJob(
			{ restaurantId: rid, productId, canonicalName: 'Naranja de zumo 570' },
			{ provider: fakeProvider('{"category": "Frutas y Verduras", "confidence": 0.93}') },
		);
		expect(await productCategoryOf(productId)).toBe('Frutas y Verduras');
	});

	it('does not re-trigger product classification for a line that matches an existing product', async () => {
		enqueueNormalizeMock.mockClear();
		enqueueCategorizeMock.mockClear();

		const supplierName = 'Mercado Central de Abastos 570, S.L.';
		const item = extractedItem({ supplier_name: supplierName, confidence: 0.9 });

		const first = await saveReviewedInvoice(item, form(supplierName, [
			{ desc: 'Limón de mesa 570', unit: 'kg', price: '1.20' },
		]), rid);
		expect(first.type).toBe('saved');
		expect(enqueueCategorizeMock).toHaveBeenCalledTimes(1);
		expect(enqueueNormalizeMock).toHaveBeenCalledTimes(1);

		enqueueNormalizeMock.mockClear();
		enqueueCategorizeMock.mockClear();

		// Same description again — resolves via the product_aliases exact
		// match this time, so the product is not "created" and must not
		// re-trigger classification.
		const second = await saveReviewedInvoice(item, form(supplierName, [
			{ desc: 'Limón de mesa 570', unit: 'kg', price: '1.30' },
		]), rid);
		expect(second.type).toBe('saved');

		expect(enqueueCategorizeMock).not.toHaveBeenCalled();
		expect(enqueueNormalizeMock).not.toHaveBeenCalled();
	});

	it('a no-signal new supplier still creates the supplier and still enqueues product classification', async () => {
		enqueueNormalizeMock.mockClear();
		enqueueCategorizeMock.mockClear();

		const supplierName = 'Comercial Anónima del Norte 570 S.L.';
		const item = extractedItem({ supplier_name: supplierName, supplier_category: null, confidence: 0.9 });

		const out = await saveReviewedInvoice(item, form(supplierName, [
			{ desc: 'Artículo variado 570', unit: 'ud', price: '2.00' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		expect(await supplierCategoryFor(out.invoiceId)).toBe(UNCATEGORIZED_CATEGORY);
		expect(enqueueCategorizeMock).toHaveBeenCalledTimes(1);
		expect(enqueueNormalizeMock).toHaveBeenCalledTimes(1);
	});
});
