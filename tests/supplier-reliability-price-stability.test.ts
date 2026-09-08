/**
 * Integration proof for issue #308: the price-stability score averages the
 * coefficient of variation *per product*, instead of pooling raw prices from
 * every product a supplier sells into one CV. Pooling conflated "different
 * products cost different amounts" with real price instability — a supplier
 * selling both a €1/kg tomato and a €6 jar of olives at rock-steady prices
 * for each would previously still score as "poco fiable" (0/33) purely from
 * mixing those two price scales together.
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
import { computeAndCacheReliabilityScore } from '../src/lib/server/supplier-reliability';

let rid = '';
let supplierId = 0;

async function invoiceWithItem(supId: number, date: string, description: string, unitPrice: number) {
	const [inv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_date, status)
		VALUES (${rid}, ${supId}, ${date}, 'pending') RETURNING id`;
	await testSql`
		INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, quantity, unit, unit_price)
		VALUES (${inv!.id}, ${rid}, ${description}, 1, 'kg', ${unitPrice})`;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('supplier-reliability-price');
	rid = r.id;
	const [sup] = await testSql`
		INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__price_stability_supplier__') RETURNING id`;
	supplierId = sup!.id;

	// Two products, each individually rock-steady, but at very different
	// price levels — a naive pooled CV would read this as wildly unstable.
	const dates = ['2026-05-01', '2026-05-15', '2026-06-01', '2026-06-15', '2026-07-01', '2026-07-15'];
	for (const d of dates) await invoiceWithItem(supplierId, d, 'Tomate pera', 1.00);
	for (const d of dates) await invoiceWithItem(supplierId, d, 'Aceitunas verdes 1kg', 6.00);
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('supplier price-stability score (issue #308)', () => {
	it('scores a supplier as stable when each of its products is individually steady, even at very different price levels', async () => {
		const result = await computeAndCacheReliabilityScore(supplierId, rid);
		expect(result.priceStabilityCv).not.toBeNull();
		expect(result.priceStabilityCv!).toBeLessThan(5);
		expect(result.priceStabilityScore).toBe(33);
	});
});
