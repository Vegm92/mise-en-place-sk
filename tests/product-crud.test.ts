/**
 * DB-backed tests for the Products CRUD server logic (full-CRUD Products
 * section): auto-resolving unit-conversion alerts when a product's pack size
 * is filled in, and the per-supplier-unlink-then-delete flow for products
 * still referenced by invoice history.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import {
	getLinkedSuppliers, unlinkSupplier, deleteProduct, resolveUnitConversionAlerts,
} from '../src/lib/server/products';

let rid = '';
let supplierAId: number;
let supplierBId: number;

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('prodcrud');
	rid = r.id;
	const [a] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__prodcrud_supplier_a__') RETURNING id`;
	const [b] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__prodcrud_supplier_b__') RETURNING id`;
	supplierAId = a!.id;
	supplierBId = b!.id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM system_notifications WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM invoice_line_items WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM invoices WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM product_aliases WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM products WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

async function makeProduct(canonicalName: string, nameKey: string) {
	const [p] = await testSql`
		INSERT INTO products (restaurant_id, canonical_name, name_key, canonical_unit)
		VALUES (${rid}, ${canonicalName}, ${nameKey}, 'kg')
		RETURNING id
	`;
	return p!.id as number;
}

describe.skipIf(!hasDbEnv)('resolveUnitConversionAlerts', () => {
	it('marks a matching pending unit_conversion_needed notification as sent once the product has a pack size', async () => {
		const productId = await makeProduct('Saco de Harina', 'saco de harina');
		await testSql`
			INSERT INTO product_aliases (restaurant_id, product_id, raw_key, raw_text, source, confirmed_at)
			VALUES (${rid}, ${productId}, 'saco de harina', 'Saco de Harina', 'exact', now())
		`;
		const [notif] = await testSql`
			INSERT INTO system_notifications (restaurant_id, notification_type, message, payload, status)
			VALUES (${rid}, 'unit_conversion_needed', 'Has comprado 2 saco de Saco de Harina...',
			        ${JSON.stringify({ ingredient: 'Saco de Harina', purchaseUnit: 'saco', quantity: 2 })}, 'pending')
			RETURNING id
		`;

		await resolveUnitConversionAlerts(testDb, rid, productId);

		const [after] = await testSql`SELECT status FROM system_notifications WHERE id = ${notif!.id}`;
		expect(after!.status).toBe('sent');
	});

	it('leaves unrelated pending notifications untouched', async () => {
		const productId = await makeProduct('Aceite de Oliva', 'aceite de oliva');
		await testSql`
			INSERT INTO product_aliases (restaurant_id, product_id, raw_key, raw_text, source, confirmed_at)
			VALUES (${rid}, ${productId}, 'aceite de oliva', 'Aceite de Oliva', 'exact', now())
		`;
		const [unrelated] = await testSql`
			INSERT INTO system_notifications (restaurant_id, notification_type, message, payload, status)
			VALUES (${rid}, 'unit_conversion_needed', 'Has comprado 1 garrafa de Sal Marina...',
			        ${JSON.stringify({ ingredient: 'Sal Marina', purchaseUnit: 'garrafa', quantity: 1 })}, 'pending')
			RETURNING id
		`;

		await resolveUnitConversionAlerts(testDb, rid, productId);

		const [after] = await testSql`SELECT status FROM system_notifications WHERE id = ${unrelated!.id}`;
		expect(after!.status).toBe('pending');
	});
});

describe.skipIf(!hasDbEnv)('deleteProduct — unlink-per-supplier flow', () => {
	it('blocks delete while linked, unblocks after unlinking every supplier, and scopes unlink to one supplier at a time', async () => {
		const productId = await makeProduct('Tomate Pera', 'tomate pera');

		const [invA] = await testSql`INSERT INTO invoices (restaurant_id, supplier_id) VALUES (${rid}, ${supplierAId}) RETURNING id`;
		const [invB] = await testSql`INSERT INTO invoices (restaurant_id, supplier_id) VALUES (${rid}, ${supplierBId}) RETURNING id`;

		await testSql`
			INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key, raw_text, source, confirmed_at)
			VALUES (${rid}, ${productId}, ${supplierAId}, 'tomate pera a', 'Tomate Pera A', 'exact', now())
		`;
		await testSql`
			INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key, raw_text, source, confirmed_at)
			VALUES (${rid}, ${productId}, ${supplierBId}, 'tomate pera b', 'Tomate Pera B', 'exact', now())
		`;
		await testSql`
			INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, product_id)
			VALUES (${rid}, ${invA!.id}, 'Tomate Pera A', ${productId})
		`;
		await testSql`
			INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, product_id)
			VALUES (${rid}, ${invB!.id}, 'Tomate Pera B', ${productId})
		`;

		// Blocked: both suppliers still linked.
		const blocked = await deleteProduct(testDb, rid, productId);
		expect(blocked.ok).toBe(false);
		if (!blocked.ok && blocked.reason === 'linked') {
			expect(blocked.suppliers.map((s) => s.supplierId).sort()).toEqual([supplierAId, supplierBId].sort());
		} else {
			throw new Error('expected linked-block result');
		}

		// Unlink supplier A only — supplier B's alias/line item must survive untouched.
		await unlinkSupplier(testDb, rid, productId, supplierAId);

		const stillLinked = await getLinkedSuppliers(testDb, rid, productId);
		expect(stillLinked).toEqual([{ supplierId: supplierBId, supplierName: '__prodcrud_supplier_b__' }]);

		const [lineA] = await testSql`SELECT product_id FROM invoice_line_items WHERE restaurant_id = ${rid} AND invoice_id = ${invA!.id}`;
		expect(lineA!.product_id).toBeNull();
		const [lineB] = await testSql`SELECT product_id FROM invoice_line_items WHERE restaurant_id = ${rid} AND invoice_id = ${invB!.id}`;
		expect(lineB!.product_id).toBe(productId);

		// Still blocked — supplier B remains.
		const stillBlocked = await deleteProduct(testDb, rid, productId);
		expect(stillBlocked.ok).toBe(false);

		// Unlink supplier B — now delete succeeds.
		await unlinkSupplier(testDb, rid, productId, supplierBId);
		const finalResult = await deleteProduct(testDb, rid, productId);
		expect(finalResult.ok).toBe(true);

		const [row] = await testSql`SELECT id FROM products WHERE id = ${productId}`;
		expect(row).toBeUndefined();
	});

	it('returns not_found for a product id that does not belong to the tenant', async () => {
		const result = await deleteProduct(testDb, rid, 999999999);
		expect(result).toEqual({ ok: false, reason: 'not_found' });
	});
});
