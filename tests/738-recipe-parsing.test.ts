/**
 * Issue #738 — three number-parsing corner cases in the recipe write path.
 *
 * 1. A manual unit cost of '0' parsed to the string '0.0000', which is not
 *    `null`, so the line priced at 0 cents with priceSource 'manual' and no
 *    missing-price warning — an unpriced line silently read as "free".
 *    Fixed by rejecting a parsed-but-zero unit cost at the write path with
 *    a dedicated 422 (`rec.err.costZero`), and by a `recipe_items_unit_cost_pos`
 *    CHECK constraint (migration 0058) so the same is true of any other path
 *    that might someday write this column directly.
 *
 * 2. `parseQty`/`parseDecimal` accepted unlimited integer digits while the
 *    columns they feed are `numeric(14,4)` / `numeric(12,4)` / `numeric(10,3)`
 *    / `numeric(12,2)` / `numeric(8,2)` — an out-of-range value reached
 *    Postgres and came back as a raw `PostgresError: numeric field overflow`
 *    (a 500), not a validation error. Fixed by bounding each parser call to
 *    the integer-digit width its column allows.
 *
 * DB-backed: the db singleton is swapped for the real test client. Skipped
 * without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { actions } from '../src/routes/(app)/recipes/[id]/+page.server';
import { actions as productActions } from '../src/routes/(app)/products/[id]/+page.server';

type ActionResult =
	| { kind: 'fail'; status: number; data: { error?: string } }
	| { kind: 'redirect'; status: number }
	| { kind: 'ok'; value: { ok?: string } };

async function runAction(
	name: 'addItem' | 'updateItem' | 'updateRecipe',
	recipeId: number,
	rid: string,
	fields: Record<string, string>
): Promise<ActionResult> {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	const event = {
		params: { id: String(recipeId) },
		locals: { restaurantId: rid, recipeGraphCache: undefined },
		request: { formData: async () => data },
	} as never;
	const value = await (actions[name] as (e: never) => Promise<unknown>)(event);
	if (value && typeof value === 'object' && 'status' in value && 'data' in value) {
		const v = value as { status: number; data: { error?: string } };
		return { kind: 'fail', status: v.status, data: v.data };
	}
	return { kind: 'ok', value: value as { ok?: string } };
}

async function newRecipe(rid: string, name: string) {
	const [row] = await testSql`
		INSERT INTO recipes (restaurant_id, name, name_key, kind, status, portions)
		VALUES (${rid}, ${name}, ${normalizeProductKey(name)}, 'plato', 'draft', '4')
		RETURNING id
	`;
	return Number(row.id);
}

async function newItem(rid: string, recipeId: number, name: string) {
	const [row] = await testSql`
		INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, net_quantity, unit, unit_cost, waste_pct, sort_order)
		VALUES (${rid}, ${recipeId}, 'free', ${name}, '1.0000', 'kg', '3.5000', '0', 1)
		RETURNING id
	`;
	return Number(row.id);
}

async function itemRow(id: number) {
	const [row] = await testSql`SELECT id, name, net_quantity, unit_cost FROM recipe_items WHERE id = ${id}`;
	return row as { id: number; name: string; net_quantity: string; unit_cost: string | null } | undefined;
}

async function recipeRow(id: number) {
	const [row] = await testSql`SELECT name, portions, selling_price, yield_qty FROM recipes WHERE id = ${id}`;
	return row as { name: string; portions: string; selling_price: string | null; yield_qty: string | null };
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('738-recipe-parsing')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('a manual unit cost of zero is rejected, not read as a real price (#738)', () => {
	it('addItem: unitCost "0" is a 422 rec.err.costZero, no line inserted', async () => {
		const recipeId = await newRecipe(rid, 'Plato coste cero');

		const result = await runAction('addItem', recipeId, rid, {
			kind: 'free', name: 'linea gratis', netQuantity: '1', unit: 'kg', unitCost: '0',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.costZero' } });
		const rows = await testSql`SELECT id FROM recipe_items WHERE recipe_id = ${recipeId}`;
		expect(rows).toHaveLength(0);
	});

	it('addItem: unitCost "0,000" (rounds to zero) is also rejected', async () => {
		const recipeId = await newRecipe(rid, 'Plato coste casi cero');

		const result = await runAction('addItem', recipeId, rid, {
			kind: 'free', name: 'linea casi gratis', netQuantity: '1', unit: 'kg', unitCost: '0.00001',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.costZero' } });
	});

	it('updateItem: unitCost "0" is a 422 rec.err.costZero, the stored line is untouched', async () => {
		const recipeId = await newRecipe(rid, 'Plato update coste cero');
		const itemId = await newItem(rid, recipeId, 'linea original');

		const result = await runAction('updateItem', recipeId, rid, {
			itemId: String(itemId), kind: 'free', name: 'linea original', netQuantity: '1', unit: 'kg', unitCost: '0',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.costZero' } });
		const row = await itemRow(itemId);
		expect(row?.unit_cost).toBe('3.5000');
	});

	it('a positive unit cost still saves normally', async () => {
		const recipeId = await newRecipe(rid, 'Plato coste normal');

		const result = await runAction('addItem', recipeId, rid, {
			kind: 'free', name: 'linea con precio', netQuantity: '1', unit: 'kg', unitCost: '4.20',
		});

		expect(result.kind).toBe('ok');
		const rows = await testSql`SELECT unit_cost FROM recipe_items WHERE recipe_id = ${recipeId}`;
		expect(rows[0]?.unit_cost).toBe('4.2000');
	});

	it('the recipe_items_unit_cost_pos CHECK constraint also rejects 0 at the DB layer directly', async () => {
		const recipeId = await newRecipe(rid, 'Plato check constraint');
		await expect(testSql`
			INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, net_quantity, unit, unit_cost, waste_pct, sort_order)
			VALUES (${rid}, ${recipeId}, 'free', 'linea sql directa', '1.0000', 'kg', '0', '0', 1)
		`).rejects.toThrow(/recipe_items_unit_cost_pos/);
	});
});

describe.skipIf(!hasDbEnv)('out-of-range numbers are a 422, never a raw Postgres overflow (#738)', () => {
	it('addItem: netQuantity at the numeric(14,4) boundary is accepted', async () => {
		const recipeId = await newRecipe(rid, 'Plato qty limite');

		const result = await runAction('addItem', recipeId, rid, {
			kind: 'free', name: 'linea al limite', netQuantity: '9999999999', unit: 'kg', unitCost: '1',
		});

		expect(result.kind).toBe('ok');
		const rows = await testSql`SELECT net_quantity FROM recipe_items WHERE recipe_id = ${recipeId}`;
		expect(rows[0]?.net_quantity).toBe('9999999999.0000');
	});

	it('addItem: netQuantity one integer digit past the numeric(14,4) boundary is a 422, not a 500', async () => {
		const recipeId = await newRecipe(rid, 'Plato qty overflow');

		const result = await runAction('addItem', recipeId, rid, {
			kind: 'free', name: 'linea overflow', netQuantity: '10000000000', unit: 'kg', unitCost: '1',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.qty' } });
		const rows = await testSql`SELECT id FROM recipe_items WHERE recipe_id = ${recipeId}`;
		expect(rows).toHaveLength(0);
	});

	it('addItem: an out-of-range unitCost is a 422 rec.err.cost, not a 500', async () => {
		const recipeId = await newRecipe(rid, 'Plato cost overflow');

		const result = await runAction('addItem', recipeId, rid, {
			kind: 'free', name: 'linea coste overflow', netQuantity: '1', unit: 'kg', unitCost: '999999999',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.cost' } });
	});

	it('addItem: an out-of-range macro (kcal100) is a 422 rec.err.macro, not a 500', async () => {
		const recipeId = await newRecipe(rid, 'Plato macro overflow');

		const result = await runAction('addItem', recipeId, rid, {
			kind: 'free', name: 'linea macro overflow', netQuantity: '1', unit: 'kg', unitCost: '1',
			kcal100: '99999999',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.macro' } });
	});

	it('updateRecipe: an out-of-range portions is a 422 rec.err.portions, stored value untouched', async () => {
		const recipeId = await newRecipe(rid, 'Plato portions overflow');
		const before = await recipeRow(recipeId);

		const result = await runAction('updateRecipe', recipeId, rid, {
			name: 'Plato portions overflow', portions: '100000000',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.portions' } });
		const after = await recipeRow(recipeId);
		expect(after.portions).toBe(before.portions);
	});

	it('updateRecipe: an out-of-range sellingPrice is a 422 rec.err.price, not a 500', async () => {
		const recipeId = await newRecipe(rid, 'Plato price overflow');

		const result = await runAction('updateRecipe', recipeId, rid, {
			name: 'Plato price overflow', sellingPrice: '99999999999',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.price' } });
	});

	it('updateRecipe: an out-of-range yieldQty is a 422 rec.err.yield, not a 500', async () => {
		const recipeId = await newRecipe(rid, 'Plato yield overflow');

		const result = await runAction('updateRecipe', recipeId, rid, {
			name: 'Plato yield overflow', kind: 'elaboracion', yieldQty: '10000000000', yieldUnit: 'kg',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.yield' } });
	});
});

describe.skipIf(!hasDbEnv)('products saveFacts also bounds its macro fields (#738)', () => {
	async function newProduct(name: string) {
		const [row] = await testSql`
			INSERT INTO products (restaurant_id, canonical_name, name_key)
			VALUES (${rid}, ${name}, ${normalizeProductKey(name)}) RETURNING id
		`;
		return Number(row.id);
	}

	async function runSaveFacts(productId: number, fields: Record<string, string>) {
		const data = new FormData();
		for (const [k, v] of Object.entries(fields)) data.append(k, v);
		const event = {
			params: { id: String(productId) },
			locals: { restaurantId: rid },
			request: { formData: async () => data },
		} as never;
		try {
			const value = await (productActions.saveFacts as (e: never) => Promise<unknown>)(event);
			if (value && typeof value === 'object' && 'status' in value && 'data' in value) {
				return { kind: 'fail', status: (value as { status: number }).status,
					data: (value as { data: { error?: string } }).data };
			}
			return { kind: 'redirect' };
		} catch (thrown) {
			if (isRedirect(thrown)) return { kind: 'redirect' };
			throw thrown;
		}
	}

	it('an out-of-range kcal100 is a 422 rec.err.macro, not a 500, and nothing is saved', async () => {
		const id = await newProduct('Producto macro overflow 738');

		const result = await runSaveFacts(id, { kcal100: '99999999' });

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.macro' } });
		const [row] = await testSql`SELECT kcal_100, nutrition_source FROM products WHERE id = ${id}`;
		expect(row.kcal_100).toBeNull();
		expect(row.nutrition_source).toBeNull();
	});

	it('a valid kcal100 still saves', async () => {
		const id = await newProduct('Producto macro normal 738');

		const result = await runSaveFacts(id, { kcal100: '350.5' });

		expect(result.kind).toBe('redirect');
		const [row] = await testSql`SELECT kcal_100 FROM products WHERE id = ${id}`;
		expect(row.kcal_100).toBe('350.50');
	});
});
