/**
 * Issue #736 — query-count regression tests (prior art: #489, see
 * tests/app-layout-load.test.ts and the `queryCount()` helper in
 * tests/alert-engine.test.ts).
 *
 * Pins the three ACCEPTANCE bullets from the issue:
 *   1. GET /recipes issues exactly one loadRecipeGraph() (one `recipes` +
 *      one `recipe_items` query), not a second bare `recipes` SELECT.
 *   2. GET /recipes/[id] issues exactly one loadRecipeGraph() per request.
 *   3. A recipe-kind addItem/updateItem POST issues exactly one
 *      loadRecipeGraph() for the whole request — action + the `load` that
 *      SvelteKit reruns right after it (same RequestEvent/locals; see
 *      render_page in @sveltejs/kit, which calls the action and then the
 *      page's `load` in one server-side call using the same `event`) —
 *      instead of once in linkTargetError and again in `load`.
 *
 * `loadRecipeGraph` is the sole place those two queries (`recipes` +
 * `recipe_items`) are issued together, so counting calls to it is
 * equivalent to counting that query pair. It is spied on (call-through, not
 * mocked) via the module namespace object — every route file under test
 * imports it from the very same resolved module, so the spy sees every
 * call, direct or via recipeCosts-style helpers.
 *
 * Pre-fix counts (verified manually with `git stash` against this same
 * test, see PR/commit notes for the transcript): GET /recipes issued
 * loadRecipeGraph once *and* a second bare `recipes` SELECT; a recipe-kind
 * addItem/updateItem POST issued loadRecipeGraph twice (linkTargetError,
 * then `load`) instead of once.
 *
 * DB-backed: the db singleton is swapped for the real test client. Skipped
 * without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { normalizeProductKey } from '../src/lib/server/normalize';
import * as recipesModule from '../src/lib/server/recipes';
import { load as listLoad } from '../src/routes/(app)/recipes/+page.server';
import { load as detailLoad, actions as detailActions } from '../src/routes/(app)/recipes/[id]/+page.server';

const loadGraphSpy = vi.spyOn(recipesModule, 'loadRecipeGraph');

function locals(rid: string) {
	return {
		restaurantId: rid,
		recipeGraphCache: null,
		entitlements: async () => null,
	} as never;
}

async function newRecipe(rid: string, name: string, kind: 'plato' | 'elaboracion' = 'plato') {
	const [row] = await testSql`
		INSERT INTO recipes (restaurant_id, name, name_key, kind, status, portions)
		VALUES (${rid}, ${name}, ${normalizeProductKey(name)}, ${kind}, 'active', '4')
		RETURNING id
	`;
	return Number(row!.id);
}

async function newItem(rid: string, recipeId: number, name: string) {
	await testSql`
		INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, unit_cost, net_quantity, unit, waste_pct, sort_order)
		VALUES (${rid}, ${recipeId}, 'free', ${name}, '2.0000', '1.0000', 'kg', '0', 1)
	`;
}

let rid = '';
let dish = 0;
let prep = 0;

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('736-query-count')).id;
	dish = await newRecipe(rid, 'Plato consulta 736');
	prep = await newRecipe(rid, 'Elaboración consulta 736', 'elaboracion');
	await newItem(rid, dish, 'Ingrediente suelto');
	await newItem(rid, prep, 'Base');
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

beforeEach(() => {
	loadGraphSpy.mockClear();
});

describe.skipIf(!hasDbEnv)('issue #736 — one recipe-graph load per request', () => {
	it('GET /recipes loads the graph exactly once (no second bare `recipes` SELECT)', async () => {
		const data = (await (listLoad as (e: unknown) => Promise<Record<string, unknown>>)({
			url: new URL('https://app.test/recipes'),
			locals: locals(rid),
		})) as { recipes: Array<{ id: number; name: string }> };

		expect(loadGraphSpy).toHaveBeenCalledTimes(1);
		// the row data must still be there, sourced off the graph instead of the removed second query
		expect(data.recipes.map((r) => r.id).sort()).toEqual([dish, prep].sort());
	});

	it('GET /recipes/[id] loads the graph exactly once', async () => {
		await (detailLoad as (e: unknown) => Promise<unknown>)({
			params: { id: String(dish) },
			locals: locals(rid),
		});

		expect(loadGraphSpy).toHaveBeenCalledTimes(1);
	});

	it('list row order matches the previous SQL-side `ORDER BY name` (now coming from the graph Map)', async () => {
		const data = (await (listLoad as (e: unknown) => Promise<Record<string, unknown>>)({
			url: new URL('https://app.test/recipes'),
			locals: locals(rid),
		})) as { recipes: Array<{ id: number; name: string }> };

		const rows = await testSql`SELECT id, name FROM recipes WHERE restaurant_id = ${rid} ORDER BY name`;
		const expectedOrder = rows.map((r) => Number((r as { id: number }).id));

		expect(data.recipes.map((r) => r.id)).toEqual(expectedOrder);
	});

	it('a recipe-kind addItem POST loads the graph exactly once for the whole request (action + the `load` SvelteKit reruns after it)', async () => {
		const requestLocals = locals(rid);

		const data = new FormData();
		data.set('kind', 'recipe');
		data.set('name', prep + '-as-line');
		data.set('childRecipeId', String(prep));
		data.set('netQuantity', '1');
		data.set('unit', 'kg');
		data.set('wastePct', '0');

		const actionResult = await (detailActions.addItem as (e: unknown) => Promise<unknown>)({
			params: { id: String(dish) },
			request: { formData: async () => data },
			locals: requestLocals,
		});
		expect(actionResult).toMatchObject({ ok: 'rec.ok.lineAdded' });

		// SvelteKit reruns `load` right after a non-redirecting action, reusing
		// the same RequestEvent/locals — simulate that here.
		const pageData = (await (detailLoad as (e: unknown) => Promise<Record<string, unknown>>)({
			params: { id: String(dish) },
			locals: requestLocals,
		})) as { items: Array<{ name: string; childRecipeId: number | null }> };

		expect(loadGraphSpy).toHaveBeenCalledTimes(1);
		// and the cached/patched graph the reused `load` reads is NOT stale —
		// it must already contain the just-added line, not the pre-write graph.
		expect(pageData.items.some((i) => i.childRecipeId === prep)).toBe(true);

		// clean up so later tests in this file see the dish's original single item
		await testSql`DELETE FROM recipe_items WHERE restaurant_id = ${rid} AND recipe_id = ${dish} AND child_recipe_id = ${prep}`;
	});

	it('a free-kind addItem POST (no recipe link) still loads the graph exactly once total', async () => {
		const requestLocals = locals(rid);

		const data = new FormData();
		data.set('kind', 'free');
		data.set('name', 'Línea suelta sin receta');
		data.set('netQuantity', '1');
		data.set('unit', 'kg');
		data.set('wastePct', '0');
		data.set('unitCost', '3');

		const actionResult = await (detailActions.addItem as (e: unknown) => Promise<unknown>)({
			params: { id: String(dish) },
			request: { formData: async () => data },
			locals: requestLocals,
		});
		expect(actionResult).toMatchObject({ ok: 'rec.ok.lineAdded' });

		await (detailLoad as (e: unknown) => Promise<unknown>)({
			params: { id: String(dish) },
			locals: requestLocals,
		});

		expect(loadGraphSpy).toHaveBeenCalledTimes(1);

		await testSql`DELETE FROM recipe_items WHERE restaurant_id = ${rid} AND recipe_id = ${dish} AND name = ${'Línea suelta sin receta'}`;
	});
});
