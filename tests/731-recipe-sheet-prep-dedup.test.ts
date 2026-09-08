/**
 * Issue #731: `buildRecipeSheet`'s prep-dedup guard compared `p.name ===
 * line.name` — the free-text label typed on the parent's line — while
 * pushing `childNode.recipe.name` — the sub-recipe's own name. Renaming a
 * line ("Fumet de pescado") that still points at the same sub-recipe
 * ("Fumet") made the guard never match, so the same prep block printed
 * twice on the A4 sheet (and on /cocina). Fix: dedup on identity — a Set of
 * `line.childRecipeId`, `continue` when already seen — not on the display
 * label, in either direction.
 *
 * DB-backed: loadRecipeGraph/computeRecipeCosts read real rows.
 * Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDbEnv, testSql, createTestRestaurant, cleanupTestRestaurant, closeDb } from './helpers/test-db';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { buildRecipeSheet } from '../src/lib/server/recipes-sheet';

async function newRecipe(rid: string, name: string, kind: string, yieldQty: string | null, yieldUnit: string | null) {
	const [row] = await testSql`
		INSERT INTO recipes (restaurant_id, name, name_key, kind, status, portions, yield_qty, yield_unit)
		VALUES (${rid}, ${name}, ${normalizeProductKey(name)}, ${kind}, 'active', '1', ${yieldQty}, ${yieldUnit})
		RETURNING id
	`;
	return Number(row!.id);
}

async function newLine(
	rid: string, recipeId: number, label: string, childRecipeId: number,
	netQuantity: string, unit: string, sortOrder: number
) {
	await testSql`
		INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, child_recipe_id, net_quantity, unit, waste_pct, sort_order)
		VALUES (${rid}, ${recipeId}, 'recipe', ${label}, ${childRecipeId}, ${netQuantity}, ${unit}, '0', ${sortOrder})
	`;
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('731-prep-dedup')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('buildRecipeSheet — preps dedup on childRecipeId, not on the line label (#731)', () => {
	it('two lines pointing at the same prep, one renamed, print exactly one prep block', async () => {
		const fumet = await newRecipe(rid, 'Fumet', 'elaboracion', '2.0000', 'L');
		await testSql`
			INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, net_quantity, unit, unit_cost, waste_pct, sort_order)
			VALUES (${rid}, ${fumet}, 'free', 'Espinas', '1.0000', 'kg', '4.0000', '0', 1)
		`;

		const dish = await newRecipe(rid, 'Arroz negro 731', 'plato', null, null);
		// First line uses the recipe's own name as the label.
		await newLine(rid, dish, 'Fumet', fumet, '0.3000', 'L', 1);
		// Second line points at the SAME prep but under a different free-text label.
		await newLine(rid, dish, 'Fumet de pescado', fumet, '0.2000', 'L', 2);

		const sheet = await buildRecipeSheet(rid, dish, new Date());
		expect(sheet).not.toBeNull();
		expect(sheet!.lines).toHaveLength(2);
		expect(sheet!.preps).toHaveLength(1);
		expect(sheet!.preps[0]!.name).toBe('Fumet');
	});

	it('two lines pointing at two DIFFERENT preps that share a display label print two blocks', async () => {
		const sofrito = await newRecipe(rid, 'Sofrito 731', 'elaboracion', '1.0000', 'kg');
		await testSql`
			INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, net_quantity, unit, unit_cost, waste_pct, sort_order)
			VALUES (${rid}, ${sofrito}, 'free', 'Tomate', '1.0000', 'kg', '2.0000', '0', 1)
		`;
		const alioli = await newRecipe(rid, 'Alioli 731', 'elaboracion', '1.0000', 'kg');
		await testSql`
			INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, net_quantity, unit, unit_cost, waste_pct, sort_order)
			VALUES (${rid}, ${alioli}, 'free', 'Ajo', '1.0000', 'kg', '3.0000', '0', 1)
		`;

		const dish = await newRecipe(rid, 'Fideua 731', 'plato', null, null);
		// Both lines share the same free-text label, "Base", but point at
		// two different sub-recipes — identity must win over the label.
		await newLine(rid, dish, 'Base', sofrito, '0.1000', 'kg', 1);
		await newLine(rid, dish, 'Base', alioli, '0.1000', 'kg', 2);

		const sheet = await buildRecipeSheet(rid, dish, new Date());
		expect(sheet).not.toBeNull();
		expect(sheet!.preps).toHaveLength(2);
		expect(sheet!.preps.map((p) => p.name).sort()).toEqual(['Alioli 731', 'Sofrito 731']);
	});
});
