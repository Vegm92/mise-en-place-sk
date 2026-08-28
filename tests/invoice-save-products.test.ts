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

	it('carries derivable pack data (unit, pack size) onto a new product row (issue #386)', async () => {
		const out = await saveReviewedInvoice(null, form('__inv_prod_sup3__', [
			{ desc: 'Leche entera 6x1L', unit: 'caja', price: '4.50' },
			{ desc: 'Sal fina', unit: 'kg', price: '0.80' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const items = await testSql`
			SELECT description, product_id FROM invoice_line_items WHERE invoice_id = ${out.invoiceId} ORDER BY description`;
		const pack = items.find((i) => i.description === 'Leche entera 6x1L')!;
		const plain = items.find((i) => i.description === 'Sal fina')!;

		const [packProduct] = await testSql`
			SELECT canonical_unit, units_per_pack, base_unit FROM products WHERE id = ${pack.product_id}`;
		expect(packProduct.canonical_unit).toBe('caja');
		expect(packProduct.units_per_pack).toBe(6);
		expect(packProduct.base_unit).toBe('L');

		// "Sal fina" has no multipack/size pattern to derive — the new product
		// carries the unit it does have, but must not fabricate pack data.
		const [plainProduct] = await testSql`
			SELECT canonical_unit, units_per_pack, base_unit FROM products WHERE id = ${plain.product_id}`;
		expect(plainProduct.canonical_unit).toBe('kg');
		expect(plainProduct.units_per_pack).toBeNull();
		expect(plainProduct.base_unit).toBeNull();
	});

	it('creates the product without a category — the supplier no longer decides', async () => {
		// Products used to be born carrying the supplier's tag, which is exactly
		// why attributing spend by the line would have been a no-op: the product
		// only echoed the supplier. A new product now starts uncategorised and
		// the categorize-product job gives it a verdict of its own.
		await testSql`
			INSERT INTO suppliers (restaurant_id, name, category)
			VALUES (${rid}, '__inv_prod_tagged__', 'Bebidas')`;

		const out = await saveReviewedInvoice(null, form('__inv_prod_tagged__', [
			{ desc: 'Tomate rama IV', unit: 'kg', price: '2.20' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [item] = await testSql`
			SELECT product_id FROM invoice_line_items WHERE invoice_id = ${out.invoiceId}`;
		const [product] = await testSql`SELECT category FROM products WHERE id = ${item.product_id}`;
		expect(product.category).toBeNull();
	});

	it('re-links the lines an interrupted save left with a NULL product_id', async () => {
		// Linking is stamped after the invoice transaction commits, inside a
		// try/catch that swallows the error — so a failure part-way leaves the
		// rest of the lines NULL and still reports success. The invoice page's
		// re-link action runs the same engine again over just those lines.
		const out = await saveReviewedInvoice(null, form('__inv_prod_relink__', [
			{ desc: 'Pimiento verde', unit: 'kg', price: '1.90' },
			{ desc: 'Calabacín', unit: 'kg', price: '1.40' },
		]), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		await testSql`
			UPDATE invoice_line_items SET product_id = NULL WHERE invoice_id = ${out.invoiceId}`;

		const { actions } = await import('../src/routes/(app)/invoice/[id]/+page.server');
		let redirected: unknown;
		try {
			await actions.relinkProducts({
				params: { id: String(out.invoiceId) },
				locals: { restaurantId: rid },
			} as never);
		} catch (e) {
			redirected = e;
		}
		expect((redirected as { status?: number } | undefined)?.status).toBe(303);

		const items = await testSql`
			SELECT product_id FROM invoice_line_items WHERE invoice_id = ${out.invoiceId}`;
		expect(items).toHaveLength(2);
		for (const it of items) expect(it.product_id).not.toBeNull();
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
		const payloads = suggestions.map((s) => s.payload);
		expect(payloads.some((p) => p.description === 'Merluza fresca grande')).toBe(true);
	});
});
