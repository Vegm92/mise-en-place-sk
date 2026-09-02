/**
 * Integration proof for issue #308: price-shock compares the new price
 * against a median of the last few purchases, not just the single most
 * recent one — a single noisy purchase (a one-off promo, a different pack,
 * a bad-batch discount) no longer reads as a shock against the very next
 * delivery, while a real, sustained price change still fires immediately.
 *
 * Runs against a live Postgres with migrations applied; skipped when
 * DATABASE_URL is absent (same pattern as alert-engine-normalized.test.ts).
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
import { runPriceShock } from '../src/lib/server/alerts';
import type { EnrichedLineItem } from '../src/lib/server/products';

const SUPPLIER = '__price_history_test_supplier__';
let rid = '';
let newInvoiceId = 0;

function item(description: string, unitPrice: number): EnrichedLineItem {
	return {
		description, quantity: 1, unit: 'kg', unitPrice, totalPrice: unitPrice,
		canonicalUnit: 'kg', requiresUnitConversion: false,
	};
}

async function insertHistoryInvoice(supplierId: number, date: string, description: string, unitPrice: number) {
	const [inv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_date, status)
		VALUES (${rid}, ${supplierId}, ${date}, 'pending') RETURNING id`;
	await testSql`
		INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, quantity, unit, unit_price)
		VALUES (${inv.id}, ${rid}, ${description}, 1, 'kg', ${unitPrice})`;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('alert-price-history');
	rid = r.id;

	const [sup] = await testSql`
		INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, ${SUPPLIER}) RETURNING id`;

	// Three prior purchases of "Tomate pera": 2.00, 2.05, and one noisy outlier
	// at 3.00 (e.g. a smaller delivered batch at a one-off higher price).
	// Median of [2.00, 2.05, 3.00] is 2.05.
	await insertHistoryInvoice(sup.id, '2026-07-01', 'Tomate pera', 2.00);
	await insertHistoryInvoice(sup.id, '2026-07-08', 'Tomate pera', 3.00);
	await insertHistoryInvoice(sup.id, '2026-07-15', 'Tomate pera', 2.05);

	// A separate ingredient with a genuine, sustained price jump: three
	// purchases all around 1.00, so a new purchase at 1.50 (+50%) is real.
	await insertHistoryInvoice(sup.id, '2026-07-01', 'Aceite de girasol', 1.00);
	await insertHistoryInvoice(sup.id, '2026-07-08', 'Aceite de girasol', 0.98);
	await insertHistoryInvoice(sup.id, '2026-07-15', 'Aceite de girasol', 1.02);

	const [newInv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_date, status)
		VALUES (${rid}, ${sup.id}, '2026-07-22', 'pending') RETURNING id`;
	newInvoiceId = newInv.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('runPriceShock — median history window (issue #308)', () => {
	it('does not fire when the new price is close to the median of recent purchases, even though the single last purchase was a noisy outlier', async () => {
		// Last single purchase was 3.00 → a naive "vs last price" comparison to
		// 2.10 would read as a -30% shock. Against the median (2.05) it's a ~2.4% move.
		const alerts = await runPriceShock(newInvoiceId, SUPPLIER, [item('Tomate pera', 2.10)], rid);
		expect(alerts).toHaveLength(0);
	});

	it('still fires on a real, sustained price change', async () => {
		const alerts = await runPriceShock(newInvoiceId, SUPPLIER, [item('Aceite de girasol', 1.50)], rid);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].payload.oldPrice).toBeCloseTo(1.00, 2);
		expect(alerts[0].payload.newPrice).toBe(1.50);
	});
});
