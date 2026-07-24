/**
 * End-to-end wiring test for issue #298: saveReviewedInvoice stamps a
 * product_id onto each saved line item and raises a product_suggestion
 * notification for fuzzy auto-links.
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

let rid = '';

function form(supplier: string, lines: Array<{ desc: string; unit: string; price: string }>): FormData {
	const fd = new FormData();
	fd.append('supplier_name', supplier);
	fd.append('invoice_number', `INV-${Math.random().toString(36).slice(2, 8)}`);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', '100');
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

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-prod');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → product linking (issue #298)', () => {
	it('stamps product_id on every saved line item and creates products', async () => {
		const out = await saveReviewedInvoice(null, form('__inv_prod_sup__', [
			{ desc: 'Tomate Pera', unit: 'kg', price: '2.00' },
			{ desc: 'Cebolla', unit: 'kg', price: '1.00' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const items = await testSql`
			SELECT description, product_id FROM invoice_line_items WHERE invoice_id = ${out.invoiceId} ORDER BY description`;
		expect(items).toHaveLength(2);
		for (const it of items) expect(it.product_id).not.toBeNull();

		const [{ count }] = await testSql`SELECT COUNT(*)::int AS count FROM products WHERE restaurant_id = ${rid}`;
		expect(count).toBeGreaterThanOrEqual(2);
	});

	it('raises a product_suggestion notification for a fuzzy near-duplicate', async () => {
		// First invoice establishes "Tomate pera"; second uses a near-duplicate.
		await saveReviewedInvoice(null, form('__inv_prod_sup2__', [
			{ desc: 'Merluza fresca', unit: 'kg', price: '9.00' },
		]), rid);
		const out = await saveReviewedInvoice(null, form('__inv_prod_sup2__', [
			{ desc: 'Merluza fresca grande', unit: 'kg', price: '11.00' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const suggestions = await testSql`
			SELECT payload FROM system_notifications
			WHERE restaurant_id = ${rid} AND notification_type = 'product_suggestion'`;
		expect(suggestions.length).toBeGreaterThanOrEqual(1);
		const payloads = suggestions.map((s) => JSON.parse(s.payload));
		expect(payloads.some((p) => p.description === 'Merluza fresca grande')).toBe(true);
	});
});
