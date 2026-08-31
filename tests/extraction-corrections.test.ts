/**
 * Issue #812: the extraction-correction log was write-only and could only
 * record that a *value* was wrong, never that the line was matched to the
 * wrong product.
 *
 * These tests cover the two halves the issue asked for:
 *  - every logged correction carries the confidence the model had in that
 *    field, so "low confidence AND corrected" (and its more interesting
 *    inverse, a silent failure) can be read back out of the table;
 *  - a reviewer can reassign a line to a different catalogue product, that
 *    reassignment sticks (line item + alias), and it is logged as a
 *    `line_item.product` correction like any other.
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

vi.mock('../src/lib/server/alerts', async () => {
	const actual = await vi.importActual<typeof import('../src/lib/server/alerts')>('../src/lib/server/alerts');
	return { ...actual, runBudgetCheck: vi.fn(actual.runBudgetCheck) };
});

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { saveReviewedInvoice, productCorrectionRows } from '../src/lib/server/invoice-save';
import { previewLineProducts } from '../src/lib/server/products';
import { runBudgetCheck } from '../src/lib/server/alerts';
import { testDb } from './helpers/test-db';
import type { BatchItem } from '../src/lib/server/batch';

let rid = '';

function fakeItem(extractedData: Record<string, unknown> | null): BatchItem {
	return {
		id: 'item-1',
		batchId: 'batch-1',
		restaurantId: rid,
		position: 0,
		fileKey: 'fake.pdf',
		displayName: 'fake.pdf',
		status: 'done',
		extractedData,
		conversionNotes: null,
		extractError: null,
		extractErrorVars: null,
		queuedAt: null,
		source: 'web',
		sourceRef: null,
		jobCode: null,
		reviewStatus: null,
	};
}

function baseForm(opts: { description: string; productId?: number }): FormData {
	const fd = new FormData();
	fd.append('supplier_name', '__inv_corr_sup__');
	fd.append('invoice_number', `INV-${Math.random().toString(36).slice(2, 8)}`);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', '12.00');
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', opts.description);
	fd.append('line_quantities', '1');
	fd.append('line_units', 'kg');
	fd.append('line_unit_prices', '12.00');
	fd.append('line_total_prices', '12.00');
	fd.append('line_tax_rates', '');
	if (opts.productId != null) fd.append('line_product_ids', String(opts.productId));
	return fd;
}

async function correctionsFor(invoiceId: number) {
	return testSql<Array<{ field_name: string; original_value: string | null; corrected_value: string | null; field_confidence: number | null; line_item_index: number | null }>>`
		SELECT field_name, original_value, corrected_value, field_confidence, line_item_index
		FROM extraction_corrections
		WHERE restaurant_id = ${rid} AND invoice_id = ${invoiceId}
		ORDER BY field_name
	`;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-corr');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe('productCorrectionRows', () => {
	const target = { invoiceId: 1, supplierId: 2, restaurantId: 'r' };

	it('logs a reassignment with the confidence the model had in that line', () => {
		const rows = productCorrectionRows(
			[{ lineItemIndex: 0, originalName: 'Tomate Cherry', correctedName: 'Tomate Pera' }],
			target,
			[{ confidence: 0.42 }],
		);
		expect(rows).toEqual([{
			...target,
			fieldName: 'line_item.product',
			originalValue: 'tomate cherry',
			correctedValue: 'tomate pera',
			lineItemIndex: 0,
			fieldConfidence: 0.42,
		}]);
	});

	it('drops a reassignment that lands on the same product', () => {
		expect(productCorrectionRows(
			[{ lineItemIndex: 0, originalName: 'Tomate Pera', correctedName: ' tomate pera ' }],
			target,
			[],
		)).toEqual([]);
	});

	it('leaves confidence null when the extraction had none for that line', () => {
		const rows = productCorrectionRows(
			[{ lineItemIndex: 1, originalName: null, correctedName: 'Tomate Pera' }],
			target,
			[{ confidence: 0.9 }],
		);
		expect(rows[0].fieldConfidence).toBeNull();
		expect(rows[0].originalValue).toBeNull();
	});
});

describe.skipIf(!hasDbEnv)('extraction corrections (issue #812)', () => {
	it('stamps the original per-field confidence on every logged correction', async () => {
		const item = fakeItem({
			supplier_name: '__inv_corr_sup__',
			invoice_number: 'WRONG-1',
			invoice_date: '2026-07-20',
			total_amount: 99,
			confidence: 0.95,
			field_confidences: { invoice_number: 0.40, total_amount: 0.97 },
			line_items: [{ description: 'Tomate Pera', quantity: 1, unit: 'kg', unit_price: 9, total_price: 9, confidence: 0.55 }],
		});
		const fd = baseForm({ description: 'Tomate Pera' });
		fd.set('invoice_number', 'RIGHT-1');

		const out = await saveReviewedInvoice(item, fd, rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const rows = await correctionsFor(out.invoiceId);
		const byField = new Map(rows.map(r => [r.field_name, r]));

		expect(byField.get('invoice_number')?.corrected_value).toBe('right-1');
		expect(Number(byField.get('invoice_number')?.field_confidence)).toBeCloseTo(0.40, 5);
		expect(Number(byField.get('total_amount')?.field_confidence)).toBeCloseTo(0.97, 5);
		expect(Number(byField.get('line_item.unit_price')?.field_confidence)).toBeCloseTo(0.55, 5);
	});

	it('honours a manual product reassignment and logs it as a correction', async () => {
		const created = await testSql<Array<{ id: number }>>`
			INSERT INTO products (restaurant_id, canonical_name, name_key)
			VALUES (${rid}, 'Tomate Pera Ecológico', 'tomate pera ecologico')
			RETURNING id
		`;
		const chosenId = created[0].id;

		const item = fakeItem({
			supplier_name: '__inv_corr_sup__',
			invoice_number: 'REASSIGN-1',
			invoice_date: '2026-07-21',
			total_amount: 12,
			confidence: 0.95,
			line_items: [{ description: 'TOM PERA CAJA', quantity: 1, unit: 'kg', unit_price: 12, total_price: 12, confidence: 0.6 }],
		});
		const fd = baseForm({ description: 'TOM PERA CAJA', productId: chosenId });
		fd.set('invoice_number', 'REASSIGN-1');

		const out = await saveReviewedInvoice(item, fd, rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const lines = await testSql<Array<{ product_id: number }>>`
			SELECT product_id FROM invoice_line_items
			WHERE restaurant_id = ${rid} AND invoice_id = ${out.invoiceId}
		`;
		expect(lines[0].product_id).toBe(chosenId);

		const aliases = await testSql<Array<{ product_id: number; source: string }>>`
			SELECT product_id, source FROM product_aliases
			WHERE restaurant_id = ${rid} AND raw_key = mep_norm_key('TOM PERA CAJA')
		`;
		expect(aliases[0]).toMatchObject({ product_id: chosenId, source: 'user' });

		const rows = await correctionsFor(out.invoiceId);
		const productRow = rows.find(r => r.field_name === 'line_item.product');
		expect(productRow?.corrected_value).toBe('tomate pera ecológico');
		expect(productRow?.line_item_index).toBe(0);
		expect(Number(productRow?.field_confidence)).toBeCloseTo(0.6, 5);
	});

	it('previews the match a line would get, without creating anything', async () => {
		const before = await testSql<Array<{ count: number }>>`
			SELECT count(*)::int AS count FROM products WHERE restaurant_id = ${rid}
		`;

		const matches = await previewLineProducts(testDb, rid, null, [
			{ description: 'TOM PERA CAJA' },
			{ description: 'Producto que no existe en el catálogo' },
		]);

		expect(matches[0].status).toBe('exact');
		expect(matches[0].productName).toBe('Tomate Pera Ecológico');
		expect(matches[1].status).toBe('new');
		expect(matches[1].productId).toBeNull();

		const after = await testSql<Array<{ count: number }>>`
			SELECT count(*)::int AS count FROM products WHERE restaurant_id = ${rid}
		`;
		expect(after[0].count).toBe(before[0].count);
	});
});

describe.skipIf(!hasDbEnv)('runPostSaveEffects isolation', () => {
	it('still logs extraction corrections when an earlier post-save effect throws', async () => {
		vi.mocked(runBudgetCheck).mockRejectedValueOnce(new Error('boom: simulated budget check failure'));

		const item = fakeItem({
			supplier_name: '__inv_corr_sup__',
			invoice_number: 'WRONG-ISO-1',
			invoice_date: '2026-07-23',
			total_amount: 12,
			confidence: 0.95,
			field_confidences: { invoice_number: 0.40 },
		});
		const fd = baseForm({ description: 'Tomate Pera' });
		fd.set('invoice_number', 'RIGHT-ISO-1');

		const out = await saveReviewedInvoice(item, fd, rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const rows = await correctionsFor(out.invoiceId);
		expect(rows.some(r => r.field_name === 'invoice_number' && r.corrected_value === 'right-iso-1')).toBe(true);
	});
});
