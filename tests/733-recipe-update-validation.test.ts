/**
 * Issue #733: `updateRecipe` had two bugs.
 *
 * 1. `parsePercent`/`parseQty` return null for both "empty" and "invalid",
 *    and the action never told them apart for vatPct/targetFoodCostPct/
 *    yieldQty the way it already did for sellingPrice — so typing garbage
 *    into VAT silently stored NULL instead of rejecting the edit, while the
 *    stored value diverged from what the editor still showed locally.
 *
 * 2. The duplicate-name guard was a SELECT-then-UPDATE against
 *    uq_recipes_rid_name_key, so two concurrent renames to the same name
 *    could both pass the read and one would raise a raw 23505 on its UPDATE
 *    instead of a controlled 409.
 *
 * DB-backed: the db singleton is swapped for the real test client so the
 * unique-index race runs against real Postgres. Skipped without DATABASE_URL.
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

type ActionResult =
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'fail'; status: number; data: { error?: string } }
	| { kind: 'ok'; value: { ok?: string } };

async function runUpdateRecipe(recipeId: number, rid: string, fields: Record<string, string>): Promise<ActionResult> {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	const event = {
		params: { id: String(recipeId) },
		locals: { restaurantId: rid },
		request: { formData: async () => data },
	} as never;
	try {
		const value = await (actions.updateRecipe as (e: never) => Promise<unknown>)(event);
		if (value && typeof value === 'object' && 'status' in value && 'data' in value) {
			const v = value as { status: number; data: { error?: string } };
			return { kind: 'fail', status: v.status, data: v.data };
		}
		return { kind: 'ok', value: value as { ok?: string } };
	} catch (thrown) {
		if (isRedirect(thrown)) return { kind: 'redirect', status: thrown.status, location: thrown.location };
		throw thrown;
	}
}

async function newRecipe(rid: string, name: string, overrides: {
	kind?: string; vatPct?: string | null; targetFoodCostPct?: string | null;
	yieldQty?: string | null; yieldUnit?: string | null;
} = {}) {
	const [row] = await testSql`
		INSERT INTO recipes (
			restaurant_id, name, name_key, kind, status, portions,
			yield_qty, yield_unit, vat_pct, target_food_cost_pct
		)
		VALUES (
			${rid}, ${name}, ${normalizeProductKey(name)}, ${overrides.kind ?? 'plato'}, 'draft', '4',
			${overrides.yieldQty ?? null}, ${overrides.yieldUnit ?? null},
			${overrides.vatPct ?? '10.00'}, ${overrides.targetFoodCostPct ?? '30.00'}
		)
		RETURNING id
	`;
	return Number(row!.id);
}

async function recipeRow(id: number) {
	const [row] = await testSql`
		SELECT name, vat_pct, target_food_cost_pct, yield_qty FROM recipes WHERE id = ${id}
	`;
	return row as { name: string; vat_pct: string | null; target_food_cost_pct: string | null; yield_qty: string | null };
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('733-update-validation')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('updateRecipe — garbage vatPct/targetFoodCostPct/yieldQty is rejected, not silently dropped (#733)', () => {
	it('rejects an unparseable vatPct with 422 rec.err.vat and leaves the stored value untouched', async () => {
		const id = await newRecipe(rid, 'Fondo oscuro', { vatPct: '10.00' });

		const result = await runUpdateRecipe(id, rid, { name: 'Fondo oscuro', vatPct: 'diez' });

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.vat' } });
		const after = await recipeRow(id);
		expect(after.vat_pct).toBe('10.00');
	});

	it('rejects an unparseable targetFoodCostPct with 422 rec.err.targetFoodCost and leaves the stored value untouched', async () => {
		const id = await newRecipe(rid, 'Salsa madre', { targetFoodCostPct: '30.00' });

		const result = await runUpdateRecipe(id, rid, { name: 'Salsa madre', targetFoodCostPct: 'treinta' });

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.targetFoodCost' } });
		const after = await recipeRow(id);
		expect(after.target_food_cost_pct).toBe('30.00');
	});

	it('rejects an unparseable yieldQty with 422 rec.err.yield and leaves the stored value untouched', async () => {
		const id = await newRecipe(rid, 'Caldo base', { kind: 'elaboracion', yieldQty: '2.0000', yieldUnit: 'L' });

		const result = await runUpdateRecipe(id, rid, {
			name: 'Caldo base', kind: 'elaboracion', yieldQty: 'mucho', yieldUnit: 'L',
		});

		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { error: 'rec.err.yield' } });
		const after = await recipeRow(id);
		expect(after.yield_qty).toBe('2.0000');
	});

	it('still allows clearing vatPct to empty (empty stays a legitimate value, not an error)', async () => {
		const id = await newRecipe(rid, 'Reducción libre', { vatPct: '21.00' });

		const result = await runUpdateRecipe(id, rid, { name: 'Reducción libre', vatPct: '' });

		expect(result.kind).toBe('ok');
		const after = await recipeRow(id);
		expect(after.vat_pct).toBeNull();
	});

	it('a normal save with valid vatPct/targetFoodCostPct still works', async () => {
		const id = await newRecipe(rid, 'Plato editable');

		const result = await runUpdateRecipe(id, rid, { name: 'Plato editable', vatPct: '21', targetFoodCostPct: '28' });

		expect(result.kind).toBe('ok');
		const after = await recipeRow(id);
		expect(after.vat_pct).toBe('21.00');
		expect(after.target_food_cost_pct).toBe('28.00');
	});
});

describe.skipIf(!hasDbEnv)('updateRecipe — concurrent renames to the same name (#733)', () => {
	it('N concurrent renames to the same name: exactly one succeeds, the rest get 409 (no 500)', async () => {
		const targetName = `Nombre en carrera ${Date.now()}`;
		const CONCURRENCY = 5;
		const sources = await Promise.all(
			Array.from({ length: CONCURRENCY }, (_, i) => newRecipe(rid, `Origen ${i} ${Date.now()}-${i}`))
		);

		const outcomes = await Promise.all(
			sources.map((id) => runUpdateRecipe(id, rid, { name: targetName }))
		);

		const succeeded = outcomes.filter((r) => r.kind === 'ok');
		const conflicted = outcomes.filter((r) => r.kind === 'fail');

		expect(succeeded).toHaveLength(1);
		expect(conflicted).toHaveLength(CONCURRENCY - 1);
		for (const conflict of conflicted) {
			if (conflict.kind !== 'fail') continue;
			expect(conflict.status).toBe(409);
			expect(conflict.data.error).toBe('rec.err.duplicate');
		}

		const rows = await testSql`SELECT id FROM recipes WHERE name = ${targetName} AND restaurant_id = ${rid}`;
		expect(rows).toHaveLength(1);
	});
});
