/**
 * DB-backed test for the product/pack backfill (follow-up to #298/#299).
 * Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { backfillRestaurant } from '../src/lib/server/backfill';

let rid = '';
let supplierId = 0;

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('backfill');
	rid = r.id;
	const [s] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__backfill_sup__') RETURNING id`;
	supplierId = s!.id;
	// An existing product the abbreviation/fuzzy layer should link to.
	await testSql`INSERT INTO products (restaurant_id, canonical_name, name_key) VALUES (${rid}, 'Ternera aguja', 'ternera aguja')`;

	const [inv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_date, status)
		VALUES (${rid}, ${supplierId}, '2026-07-01', 'pending') RETURNING id`;
	// Legacy line items: no product_id, no pack fields.
	await testSql`
		INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, unit, unit_price)
		VALUES
			(${inv!.id}, ${rid}, 'REF.1042 TERN. AGUJA', 'kg', 8.0),
			(${inv!.id}, ${rid}, 'Aceite girasol garrafa 5L', 'garrafa', 12.5)`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('backfillRestaurant', () => {
	it('links products and computes pack fields on legacy line items', async () => {
		const res = await backfillRestaurant(testDb, rid);
		expect(res.linked).toBe(2);
		expect(res.packed).toBeGreaterThanOrEqual(1); // the 5L garrafa line

		// The abbreviated line was linked to the existing "Ternera aguja" product.
		const [tern] = await testSql`
			SELECT li.product_id, p.name_key
			FROM invoice_line_items li JOIN products p ON p.id = li.product_id
			WHERE li.restaurant_id = ${rid} AND li.description = 'REF.1042 TERN. AGUJA'`;
		expect(tern!.name_key).toBe('ternera aguja');

		// The garrafa line got €/base: 12.5 / 5 L = 2.5 €/L.
		const [oil] = await testSql`
			SELECT base_unit, normalized_unit_price FROM invoice_line_items
			WHERE restaurant_id = ${rid} AND description = 'Aceite girasol garrafa 5L'`;
		expect(oil!.base_unit).toBe('L');
		expect(Number(oil!.normalized_unit_price)).toBeCloseTo(2.5, 4);
	});

	it('is idempotent — a second run links nothing new', async () => {
		const res = await backfillRestaurant(testDb, rid);
		expect(res.linked).toBe(0);
		expect(res.packed).toBe(0);
	});
});
