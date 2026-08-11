/**
 * End-to-end wiring test for issue #384: saveReviewedInvoice must apply the
 * category extraction proposes to a brand-new supplier, keep falling back to
 * the uncategorised bucket when there is genuinely no signal, and never
 * overwrite a category a human already set on an existing supplier.
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

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';
import { UNCATEGORIZED_CATEGORY } from '../src/lib/constants';

let rid = '';

function form(supplier: string, lines: Array<{ desc: string; unit: string; price: string }> = []): FormData {
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

function extractedItem(data: Record<string, unknown>) {
	return { extractedData: data } as unknown as Parameters<typeof saveReviewedInvoice>[0];
}

async function categoryFor(invoiceId: number): Promise<string | null> {
	const rows = await testSql`
		SELECT s.category FROM suppliers s
		JOIN invoices i ON i.supplier_id = s.id
		WHERE i.id = ${invoiceId}`;
	return rows[0]?.category ?? null;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-cat-384');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → supplier category (issue #384)', () => {
	it('categorises a brand-new high-signal supplier saved exactly as extracted', async () => {
		const supplierName = 'Suministros Alimentarios Goya, S.L.';
		const item = extractedItem({
			supplier_name: supplierName,
			supplier_category: 'Aceites y Conservas',
			field_confidences: { supplier_category: 0.9 },
			confidence: 0.9,
		});

		const out = await saveReviewedInvoice(item, form(supplierName, [
			{ desc: 'Aceite de Oliva Virgen Extra', unit: 'L', price: '10' },
			{ desc: 'Tomate Triturado', unit: 'kg', price: '5' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		expect(await categoryFor(out.invoiceId)).toBe('Aceites y Conservas');
	});

	it('still categorises when the user trivially corrects the supplier name on review (the #384 bug)', async () => {
		// Extraction dropped the legal suffix; the review screen is exactly
		// where a user fixes that — this correction must not be read as "a
		// different supplier" and must not discard the proposed category.
		const extractedName = 'Panificadora Els Encants';
		const correctedName = 'Panificadora Els Encants, S.L.';
		const item = extractedItem({
			supplier_name: extractedName,
			supplier_category: 'Panadería y Bollería',
			field_confidences: { supplier_category: 0.88 },
			confidence: 0.9,
		});

		const out = await saveReviewedInvoice(item, form(correctedName, [
			{ desc: 'Barra de Pan', unit: 'ud', price: '1' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		expect(await categoryFor(out.invoiceId)).toBe('Panadería y Bollería');
	});

	it('falls back to the uncategorised bucket when the user renames to a genuinely different supplier', async () => {
		const item = extractedItem({
			supplier_name: 'Lácteos García, S.L.',
			supplier_category: 'Lácteos',
			field_confidences: { supplier_category: 0.9 },
			confidence: 0.9,
		});

		const out = await saveReviewedInvoice(item, form('García Bebidas, S.L.', [
			{ desc: 'Refresco de Cola', unit: 'ud', price: '1' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		expect(await categoryFor(out.invoiceId)).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('falls back to the uncategorised bucket for a genuinely no-signal new supplier', async () => {
		const supplierName = 'Comercial Genérica del Levante S.L.';
		const item = extractedItem({
			supplier_name: supplierName,
			supplier_category: null,
			field_confidences: { supplier_category: 0.2 },
			confidence: 0.9,
		});

		const out = await saveReviewedInvoice(item, form(supplierName, [
			{ desc: 'Material de oficina variado', unit: 'ud', price: '1' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		expect(await categoryFor(out.invoiceId)).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('never overwrites an existing supplier category with a later, different guess', async () => {
		const supplierName = 'Bebidas Costa Brava S.L.';
		const first = extractedItem({
			supplier_name: supplierName,
			supplier_category: 'Bebidas',
			field_confidences: { supplier_category: 0.9 },
			confidence: 0.9,
		});
		const firstOut = await saveReviewedInvoice(first, form(supplierName, [
			{ desc: 'Agua Mineral', unit: 'botella', price: '1' },
		]), rid);
		expect(firstOut.type).toBe('saved');
		if (firstOut.type !== 'saved') return;
		expect(await categoryFor(firstOut.invoiceId)).toBe('Bebidas');

		// A human overrides it away from the machine guess.
		await testSql`
			UPDATE suppliers SET category = 'Vinos y Cavas'
			WHERE restaurant_id = ${rid} AND lower(name) = lower(${supplierName})`;

		// A second invoice arrives with a different, even higher-confidence guess.
		const second = extractedItem({
			supplier_name: supplierName,
			supplier_category: 'Congelados',
			field_confidences: { supplier_category: 0.99 },
			confidence: 0.99,
		});
		const secondOut = await saveReviewedInvoice(second, form(supplierName, [
			{ desc: 'Guisantes Congelados', unit: 'kg', price: '3' },
		]), rid);
		expect(secondOut.type).toBe('saved');
		if (secondOut.type !== 'saved') return;

		expect(await categoryFor(secondOut.invoiceId)).toBe('Vinos y Cavas');
	});
});
