import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDbEnv, testSql, createTestRestaurant, cleanupTestRestaurant, closeDb } from './helpers/test-db';
import { loadRecipeGraph, recipeCosts, recipeParents, countRecipes, wouldCycle } from '../src/lib/server/recipes';

let ridA = '';
let ridB = '';
let dish = 0;
let prep = 0;
let foreign = 0;

async function newRecipe(rid: string, name: string, kind: string, yieldQty: string | null, yieldUnit: string | null) {
	const [row] = await testSql`
		INSERT INTO recipes (restaurant_id, name, name_key, kind, status, portions, yield_qty, yield_unit)
		VALUES (${rid}, ${name}, ${name.toLowerCase()}, ${kind}, 'active', '1', ${yieldQty}, ${yieldUnit})
		RETURNING id
	`;
	return Number(row.id);
}

describe.skipIf(!hasDbEnv)('recipe graph against a real database', () => {
	beforeAll(async () => {
		ridA = (await createTestRestaurant('recipes-a')).id;
		ridB = (await createTestRestaurant('recipes-b')).id;
		dish = await newRecipe(ridA, 'Arroz negro', 'plato', null, null);
		prep = await newRecipe(ridA, 'Fumet', 'elaboracion', '2.0000', 'L');
		foreign = await newRecipe(ridB, 'Plato ajeno', 'plato', null, null);

		await testSql`
			INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, net_quantity, unit, unit_cost, waste_pct, sort_order)
			VALUES (${ridA}, ${prep}, 'free', 'Espinas', '1.0000', 'kg', '4.0000', '0', 1)
		`;
		await testSql`
			INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, child_recipe_id, net_quantity, unit, waste_pct, sort_order)
			VALUES (${ridA}, ${dish}, 'recipe', 'Fumet', ${prep}, '0.5000', 'L', '0', 1)
		`;
	});

	afterAll(async () => {
		await cleanupTestRestaurant(ridA);
		await cleanupTestRestaurant(ridB);
		await closeDb();
	});

	it('loads only the calling tenant graph', async () => {
		const graph = await loadRecipeGraph(ridA);
		expect([...graph.keys()].sort()).toEqual([dish, prep].sort());
		expect(graph.has(foreign)).toBe(false);
	});

	it('costs a sub-recipe line pro rata of the child yield', async () => {
		const costs = await recipeCosts(ridA);
		expect(costs.get(prep)!.totalCostCents).toBe(400);
		expect(costs.get(dish)!.totalCostCents).toBe(100);
	});

	it('reports the parents that block deleting a prep', async () => {
		const parents = await recipeParents(ridA, prep);
		expect(parents.map((p) => p.id)).toEqual([dish]);
		expect(await recipeParents(ridA, dish)).toEqual([]);
	});

	it('counts only non-archived sheets for the quota', async () => {
		expect(await countRecipes(ridA)).toBe(2);
		await testSql`UPDATE recipes SET status = 'archived' WHERE id = ${prep}`;
		expect(await countRecipes(ridA)).toBe(1);
		await testSql`UPDATE recipes SET status = 'active' WHERE id = ${prep}`;
	});

	it('refuses an edge that would close a loop, and allows one that would not', async () => {
		const graph = await loadRecipeGraph(ridA);
		expect(wouldCycle(graph, prep, dish)).toBe(true);
		expect(wouldCycle(graph, dish, prep)).toBe(false);
	});

	it('lets the database reject a cross-tenant sub-recipe link outright', async () => {
		await expect(testSql`
			INSERT INTO recipe_items (restaurant_id, recipe_id, kind, name, child_recipe_id, net_quantity, unit, waste_pct, sort_order)
			VALUES (${ridA}, ${dish}, 'recipe', 'Ajeno', ${foreign}, '1.0000', 'kg', '0', 9)
		`).rejects.toThrow();
	});

	it('refuses to delete a prep another sheet still uses', async () => {
		await expect(testSql`DELETE FROM recipes WHERE id = ${prep}`).rejects.toThrow();
	});
});
