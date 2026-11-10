/**
 * Issue #734: `updateItem`/`deleteItem` parsed itemId with only
 * `Number.isInteger`, so a missing/empty itemId became `0`, passed that
 * check, matched no row, and the action still reported success ("línea
 * eliminada"). Neither action checked the affected row count, so an id from
 * a different recipe in the same tenant also "succeeded" without touching
 * anything.
 *
 * DB-backed: runs against the real db singleton, so the row-count check
 * runs against real Postgres. Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { actions } from '../src/routes/(app)/recipes/[id]/+page.server';

type ActionResult =
	| { kind: 'fail'; status: number; data: { error?: string } }
	| { kind: 'ok'; value: { ok?: string } };

async function runAction(
	name: 'addItem' | 'updateItem' | 'deleteItem',
	recipeId: number,
	rid: string,
	fields: Record<string, string>
): Promise<ActionResult> {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	const event = {
		params: { id: String(recipeId) },
		locals: { restaurantId: rid },
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
	return Number(row!.id);
}

async function newItem(rid: string, recipeId: number, name: string) {
	const [row] = await testSql`
		INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, net_quantity, unit, waste_pct, sort_order)
		VALUES (${rid}, ${recipeId}, 'free', ${name}, '1.0000', 'kg', '0', 1)
		RETURNING id
	`;
	return Number(row!.id);
}

async function itemRow(id: number) {
	const [row] = await testSql`SELECT id, name, recipe_id FROM recipe_items WHERE id = ${id}`;
	return row as { id: number; name: string; recipe_id: number } | undefined;
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('734-item-id-validation')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('deleteItem — itemId=0, missing, or cross-recipe must not report success (#734)', () => {
	it('with no itemId: 4xx rec.err.lineId, nothing deleted', async () => {
		const recipeId = await newRecipe(rid, 'Plato sin línea');
		const itemId = await newItem(rid, recipeId, 'Línea original');

		const result = await runAction('deleteItem', recipeId, rid, {});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.lineId' } });
		expect(await itemRow(itemId)).toBeDefined();
	});

	it('with itemId=0: 4xx rec.err.lineId, nothing deleted', async () => {
		const recipeId = await newRecipe(rid, 'Plato itemId cero');
		const itemId = await newItem(rid, recipeId, 'Línea original');

		const result = await runAction('deleteItem', recipeId, rid, { itemId: '0' });

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.lineId' } });
		expect(await itemRow(itemId)).toBeDefined();
	});

	it('with an id from a different recipe in the same tenant: 404-style, nothing deleted', async () => {
		const recipeA = await newRecipe(rid, 'Receta A borrar');
		const recipeB = await newRecipe(rid, 'Receta B borrar');
		const itemInA = await newItem(rid, recipeA, 'Línea de A');

		const result = await runAction('deleteItem', recipeB, rid, { itemId: String(itemInA) });

		expect(result).toMatchObject({ kind: 'fail', status: 404, data: { error: 'rec.err.lineNotFound' } });
		expect(await itemRow(itemInA)).toBeDefined();
	});

	it('with an id that does not exist at all: 404, not a crash', async () => {
		const recipeId = await newRecipe(rid, 'Plato id inexistente');
		const missingId = 999_999_999;
		expect(await itemRow(missingId)).toBeUndefined();

		const result = await runAction('deleteItem', recipeId, rid, { itemId: String(missingId) });

		expect(result).toMatchObject({ kind: 'fail', status: 404, data: { error: 'rec.err.lineNotFound' } });
	});

	it('with a valid itemId in the right recipe still deletes', async () => {
		const recipeId = await newRecipe(rid, 'Plato feliz borrar');
		const itemId = await newItem(rid, recipeId, 'Línea a borrar');

		const result = await runAction('deleteItem', recipeId, rid, { itemId: String(itemId) });

		expect(result.kind).toBe('ok');
		expect(await itemRow(itemId)).toBeUndefined();
	});
});

describe.skipIf(!hasDbEnv)('updateItem — itemId=0 or cross-recipe id must not report success (#734)', () => {
	it('with itemId=0: 4xx rec.err.lineId, nothing changed', async () => {
		const recipeId = await newRecipe(rid, 'Plato update cero');
		const itemId = await newItem(rid, recipeId, 'Línea original');

		const result = await runAction('updateItem', recipeId, rid, {
			itemId: '0', name: 'Línea nueva', netQuantity: '2', unit: 'kg',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.lineId' } });
		const row = await itemRow(itemId);
		expect(row?.name).toBe('Línea original');
	});

	it('with an id from a different recipe in the same tenant: 404-style, nothing changed', async () => {
		const recipeA = await newRecipe(rid, 'Receta A actualizar');
		const recipeB = await newRecipe(rid, 'Receta B actualizar');
		const itemInA = await newItem(rid, recipeA, 'Línea de A intacta');

		const result = await runAction('updateItem', recipeB, rid, {
			itemId: String(itemInA), name: 'Secuestrada', netQuantity: '2', unit: 'kg',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 404, data: { error: 'rec.err.lineNotFound' } });
		const row = await itemRow(itemInA);
		expect(row?.name).toBe('Línea de A intacta');
		expect(row?.recipe_id).toBe(recipeA);
	});

	it('with a valid itemId in the right recipe still saves', async () => {
		const recipeId = await newRecipe(rid, 'Plato feliz');
		const itemId = await newItem(rid, recipeId, 'Línea original');

		const result = await runAction('updateItem', recipeId, rid, {
			itemId: String(itemId), name: 'Línea actualizada', netQuantity: '2', unit: 'kg',
		});

		expect(result.kind).toBe('ok');
		const row = await itemRow(itemId);
		expect(row?.name).toBe('Línea actualizada');
	});
});

async function wasteOf(itemId: number) {
	const [row] = await testSql`SELECT waste_pct FROM recipe_items WHERE id = ${itemId}`;
	return Number(row!.waste_pct);
}

async function lineCount(recipeId: number) {
	const [row] = await testSql`SELECT count(*)::int AS n FROM recipe_items WHERE recipe_id = ${recipeId}`;
	return Number(row!.n);
}

const line = (wastePct: string) => ({ name: 'Tomate', netQuantity: '1', unit: 'kg', wastePct });

describe.skipIf(!hasDbEnv)('recipe line waste of 100% or more is rejected (RULE-007, issue #1270)', () => {
	it.each(['100', '100.00', '100,5', '150', '1000'])('addItem rejects wastePct=%s and stores nothing', async (waste) => {
		const recipeId = await newRecipe(rid, `Plato merma add ${waste}`);

		const result = await runAction('addItem', recipeId, rid, line(waste));

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.waste' } });
		expect(await lineCount(recipeId)).toBe(0);
	});

	it.each(['100', '150'])('updateItem rejects wastePct=%s and keeps the old value', async (waste) => {
		const recipeId = await newRecipe(rid, `Plato merma update ${waste}`);
		const itemId = await newItem(rid, recipeId, 'Línea original');

		const result = await runAction('updateItem', recipeId, rid, { ...line(waste), itemId: String(itemId) });

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.waste' } });
		expect(await wasteOf(itemId)).toBe(0);
	});

	it('still accepts the highest valid waste, 99.99, and a Spanish comma value', async () => {
		const recipeId = await newRecipe(rid, 'Plato merma valida');

		expect((await runAction('addItem', recipeId, rid, line('99.99'))).kind).toBe('ok');
		expect((await runAction('addItem', recipeId, rid, line('20,5'))).kind).toBe('ok');
		expect(await lineCount(recipeId)).toBe(2);
	});
});
