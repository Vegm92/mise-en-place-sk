import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { actions } from '../src/routes/(app)/recipes/[id]/+page.server';

type ActionResult =
	| { kind: 'fail'; status: number; data: { error?: string } }
	| { kind: 'ok'; value: { ok?: string } };

async function runAction(
	name: 'addItem' | 'updateItem',
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

async function newItem(rid: string, recipeId: number) {
	const [row] = await testSql`
		INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, net_quantity, unit, waste_pct, sort_order)
		VALUES (${rid}, ${recipeId}, 'free', 'Línea original', '1.0000', 'kg', '10', 1)
		RETURNING id
	`;
	return Number(row!.id);
}

async function wasteOf(itemId: number) {
	const [row] = await testSql`SELECT waste_pct FROM recipe_items WHERE id = ${itemId}`;
	return Number(row!.waste_pct);
}

async function lineCount(recipeId: number) {
	const [row] = await testSql`SELECT count(*)::int AS n FROM recipe_items WHERE recipe_id = ${recipeId}`;
	return Number(row!.n);
}

const line = (wastePct: string) => ({ name: 'Tomate', netQuantity: '1', unit: 'kg', wastePct });

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('1270-recipe-waste')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('recipe line waste of 100% or more is rejected (RULE-007, issue #1270)', () => {
	it.each(['100', '100.00', '100,5', '150', '1000'])('addItem rejects wastePct=%s and stores nothing', async (waste) => {
		const recipeId = await newRecipe(rid, `Plato merma add ${waste}`);

		const result = await runAction('addItem', recipeId, rid, line(waste));

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.waste' } });
		expect(await lineCount(recipeId)).toBe(0);
	});

	it.each(['100', '150'])('updateItem rejects wastePct=%s and keeps the old value', async (waste) => {
		const recipeId = await newRecipe(rid, `Plato merma update ${waste}`);
		const itemId = await newItem(rid, recipeId);

		const result = await runAction('updateItem', recipeId, rid, { ...line(waste), itemId: String(itemId) });

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.waste' } });
		expect(await wasteOf(itemId)).toBe(10);
	});

	it('still accepts the highest valid waste, 99.99, and a Spanish comma value', async () => {
		const recipeId = await newRecipe(rid, 'Plato merma valida');

		expect((await runAction('addItem', recipeId, rid, line('99.99'))).kind).toBe('ok');
		expect((await runAction('addItem', recipeId, rid, line('20,5'))).kind).toBe('ok');
		expect(await lineCount(recipeId)).toBe(2);
	});
});
