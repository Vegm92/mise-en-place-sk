/**
 * /products supplier_count: counted only product_aliases, so products bought
 * through invoices but never aliased showed "0 proveedores" while the detail
 * page listed per-supplier prices. The count must be the distinct suppliers
 * across aliases and invoice lines of non-deleted invoices, tenant-scoped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { load } from '../src/routes/(app)/products/+page.server';

let rid = '';
let otherRid = '';

type ListProduct = { id: number; supplierCount: number; aliasCount: number };

async function loadProducts(restaurantId: string): Promise<ListProduct[]> {
	const event = {
		url: new URL('http://localhost/products'),
		locals: { restaurantId },
		parent: undefined,
	} as never;
	const out = (await (load as (e: never) => Promise<unknown>)(event)) as { products: ListProduct[] };
	return out.products;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('prodlistsup')).id;
	otherRid = (await createTestRestaurant('prodlistsup_other')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await cleanupTestRestaurant(otherRid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('/products load — supplier_count', () => {
	it('counts distinct suppliers across aliases and live invoice lines, ignoring deleted invoices', async () => {
		const [a] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__pls_a__') RETURNING id`;
		const [b] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__pls_b__') RETURNING id`;
		const [c] = await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__pls_c__') RETURNING id`;
		const [p] = await testSql`
			INSERT INTO products (restaurant_id, canonical_name, name_key)
			VALUES (${rid}, 'Tomate', 'tomate') RETURNING id
		`;
		const [q] = await testSql`
			INSERT INTO products (restaurant_id, canonical_name, name_key)
			VALUES (${rid}, 'Cebolla', 'cebolla') RETURNING id
		`;

		await testSql`
			INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key, raw_text, source, confirmed_at)
			VALUES (${rid}, ${p!.id}, ${a!.id}, 'tomate a', 'Tomate A', 'exact', now())
		`;
		const [invA] = await testSql`INSERT INTO invoices (restaurant_id, supplier_id) VALUES (${rid}, ${a!.id}) RETURNING id`;
		const [invB] = await testSql`INSERT INTO invoices (restaurant_id, supplier_id) VALUES (${rid}, ${b!.id}) RETURNING id`;
		const [invC] = await testSql`
			INSERT INTO invoices (restaurant_id, supplier_id, deleted_at) VALUES (${rid}, ${c!.id}, now()) RETURNING id
		`;
		for (const inv of [invA, invB, invC]) {
			await testSql`
				INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, product_id)
				VALUES (${rid}, ${inv!.id}, 'Tomate', ${p!.id})
			`;
		}
		await testSql`
			INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, product_id)
			VALUES (${rid}, ${invB!.id}, 'Cebolla', ${q!.id})
		`;

		const rows = await loadProducts(rid);
		const tomate = rows.find((r) => r.id === p!.id)!;
		const cebolla = rows.find((r) => r.id === q!.id)!;
		expect(tomate.supplierCount).toBe(2);
		expect(tomate.aliasCount).toBe(1);
		expect(cebolla.supplierCount).toBe(1);
		expect(cebolla.aliasCount).toBe(0);

		expect(await loadProducts(otherRid)).toEqual([]);
	});
});
