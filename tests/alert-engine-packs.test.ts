/**
 * Integration proof for issue #299: once differently-sized descriptions of one
 * product are grouped by product_id (issue #298), price-shock compares them as
 * €/base-unit — so a larger pack that costs proportionally more does not read as
 * a shock, but a real €/kg move still fires. Falls back to raw unit price when
 * no pack/product grouping is available.
 *
 * DB-backed (needs migrations through 0020 + mep_norm_key); the db singleton is
 * swapped for the test client. Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', () => import('./helpers/mock-db'));

import { runPriceShock, hasDbEnv, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant } from './helpers/alert-engine-fixtures';
import { parsePack, normalizedUnitPrice, type EnrichedLineItem } from '../src/lib/server/products';
import { normalizeProductKey } from '../src/lib/server/normalize';

const SUPPLIER = '__pack_shock_supplier__';
let rid = '';
let supplierId = 0;

function item(description: string, unitPrice: number): EnrichedLineItem {
	return {
		description, quantity: 1, unit: null, unitPrice,
		totalPrice: unitPrice, canonicalUnit: null, requiresUnitConversion: false,
	};
}

async function makeProduct(name: string): Promise<number> {
	const [p] = await testSql`
		INSERT INTO products (restaurant_id, canonical_name, name_key)
		VALUES (${rid}, ${name}, ${normalizeProductKey(name)}) RETURNING id`;
	return p!.id;
}

/** Insert a historical line the way saveReviewedInvoice would (pack fields + product). */
async function seedLine(description: string, unitPrice: number, invoiceDate: string, productId: number) {
	const [inv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_date, status)
		VALUES (${rid}, ${supplierId}, ${invoiceDate}, 'pending') RETURNING id`;
	const pack = parsePack(description, null);
	const norm = normalizedUnitPrice(unitPrice, pack);
	await testSql`
		INSERT INTO invoice_line_items
			(invoice_id, restaurant_id, description, quantity, unit, unit_price, product_id,
			 units_per_pack, unit_size, size_unit, base_unit, normalized_unit_price)
		VALUES (${inv!.id}, ${rid}, ${description}, 1, null, ${unitPrice}, ${productId},
			${pack?.unitsPerPack ?? null}, ${pack?.unitSize ?? null}, ${pack?.sizeUnit ?? null},
			${pack?.baseUnit ?? null}, ${norm})`;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('pack-shock');
	rid = r.id;
	const [sup] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, ${SUPPLIER}) RETURNING id`;
	supplierId = sup!.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('runPriceShock — pack-normalized comparison (issue #299)', () => {
	it('does NOT fire when a larger pack of one product costs proportionally more', async () => {
		const pid = await makeProduct('Harina de trigo');
		await seedLine('Harina caja 5kg', 12.5, '2026-07-01', pid); // 2.50 €/kg
		// New "Harina caja 10kg" @24.00 = 2.40 €/kg — a 92% jump per caja, -4% per kg.
		const newDesc = 'Harina caja 10kg';
		const map = new Map([[normalizeProductKey(newDesc), pid]]);
		const alerts = await runPriceShock(9_999_001, SUPPLIER, [item(newDesc, 24.0)], rid, map);
		expect(alerts).toHaveLength(0);
	});

	it('fires when the €/kg genuinely rises across pack sizes', async () => {
		const pid = await makeProduct('Azucar blanquilla');
		await seedLine('Azucar saco 25kg', 25.0, '2026-07-02', pid); // 1.00 €/kg
		// New "Azucar saco 10kg" @15.00 = 1.50 €/kg — +50% per kg.
		const newDesc = 'Azucar saco 10kg';
		const map = new Map([[normalizeProductKey(newDesc), pid]]);
		const alerts = await runPriceShock(9_999_002, SUPPLIER, [item(newDesc, 15.0)], rid, map);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]!.payload.basis).toBe('per_base_unit');
		expect(alerts[0]!.payload.baseUnit).toBe('kg');
		expect(alerts[0]!.payload.oldPrice).toBe(1);
		expect(alerts[0]!.payload.newPrice).toBe(1.5);
	});

	it('falls back to raw unit price when no pack/product grouping applies', async () => {
		const pid = await makeProduct('Perejil fresco');
		await seedLine('Perejil fresco', 1.0, '2026-07-03', pid);
		const map = new Map([[normalizeProductKey('Perejil fresco'), pid]]);
		const alerts = await runPriceShock(9_999_003, SUPPLIER, [item('Perejil fresco', 2.0)], rid, map);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]!.payload.basis).toBe('per_unit');
	});
});
