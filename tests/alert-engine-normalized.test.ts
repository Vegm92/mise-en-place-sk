/**
 * Integration proof for issue #296: cross-invoice matching in the alert
 * engine uses the shared normalized key, so a supplier reprinting the same
 * product with different casing/accents/spacing still triggers price-shock
 * alerts and stock-forecast updates.
 *
 * Runs against a live Postgres with migrations applied (mep_norm_key must
 * exist); skipped when DATABASE_URL is absent. The db singleton is replaced
 * with the test client because src/lib/server/db.ts forces ssl:'require',
 * which local/CI Postgres does not speak.
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
import { runPriceShock, runStockForecast } from '../src/lib/server/alert-engine';
import type { EnrichedLineItem } from '../src/lib/server/products';

const SUPPLIER = '__norm_test_supplier__';
let rid = '';
let newInvoiceId = 0;

function item(description: string, unitPrice: number | null, quantity = 1): EnrichedLineItem {
	return {
		description, quantity, unit: 'kg', unitPrice,
		totalPrice: unitPrice != null ? unitPrice * quantity : null,
		canonicalUnit: 'kg', requiresUnitConversion: false,
	};
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('alert-norm');
	rid = r.id;

	const [sup] = await testSql`
		INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, ${SUPPLIER}) RETURNING id`;
	const [oldInv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_date, status)
		VALUES (${rid}, ${sup.id}, '2026-07-01', 'pending') RETURNING id`;
	const [newInv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_date, status)
		VALUES (${rid}, ${sup.id}, '2026-07-20', 'pending') RETURNING id`;
	newInvoiceId = newInv.id;

	// Historical prices, spelled the way the supplier printed them back then.
	await testSql`
		INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, quantity, unit, unit_price)
		VALUES
			(${oldInv.id}, ${rid}, 'TOMATE PERA', 10, 'kg', 2.00),
			(${oldInv.id}, ${rid}, 'Azúcar blanquilla', 5, 'kg', 1.00)`;

	await testSql`
		INSERT INTO stock_levels (restaurant_id, ingredient, current_stock, daily_burn_rate, canonical_unit)
		VALUES (${rid}, 'harina 00', 1, 1, 'kg')`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('runPriceShock — normalized matching (issue #296)', () => {
	it('fires when the same product is reprinted with different casing/spacing', async () => {
		const alerts = await runPriceShock(newInvoiceId, SUPPLIER, [item('Tomate  Pera', 3.0)], rid);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].notificationType).toBe('price_shock');
		expect(alerts[0].payload.oldPrice).toBe(2.0);
		expect(alerts[0].payload.newPrice).toBe(3.0);
	});

	it('fires across accent differences (azucar vs Azúcar)', async () => {
		const alerts = await runPriceShock(newInvoiceId, SUPPLIER, [item('AZUCAR BLANQUILLA', 1.5)], rid);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].payload.oldPrice).toBe(1.0);
	});

	it('stays silent when the price change is under the threshold', async () => {
		const alerts = await runPriceShock(newInvoiceId, SUPPLIER, [item('tomate pera', 2.1)], rid);
		expect(alerts).toHaveLength(0);
	});
});

describe.skipIf(!hasDbEnv)('runStockForecast — normalized matching (issue #296)', () => {
	it('matches a stock row saved with different casing', async () => {
		const alerts = await runStockForecast([item('HARINA 00', null, 1)], rid);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].notificationType).toBe('low_stock_forecast');
		// (current 1 + added 1) / burn 1 = 2 days < 3-day threshold
		expect(alerts[0].payload.projectedDays).toBe(2);
	});
});
