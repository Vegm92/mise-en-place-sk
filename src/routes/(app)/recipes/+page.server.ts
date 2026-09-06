import { fail, redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { normalizeProductKey } from '$lib/server/normalize';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import {
	collectProductIds, computeRecipeCosts, costDeltaPct, countRecipes, loadProductFacts, loadRecipeGraph,
	recipeCostTrend, resolveProductPrices
} from '$lib/server/recipes';
import { localToday } from '$lib/server/period-range';
import { RECIPE_SECTIONS, RECIPE_STATUSES, isRecipeKind } from '$lib/recipes';
import { periodRange } from '$lib/server/period-range';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const rid = locals.restaurantId!;
	const { activePeriod: period } = await parent?.() ?? periodRange(url);
	const today = localToday();

	return handleLoad('recipes', async () => {
		const [graph, entitlements] = await Promise.all([
			loadRecipeGraph(rid),
			locals.entitlements(),
		]);

		const [prices, facts, trend] = await Promise.all([
			resolveProductPrices(rid, collectProductIds(graph, true)),
			loadProductFacts(rid, collectProductIds(graph, false)),
			recipeCostTrend(rid, graph, today),
		]);
		const costs = computeRecipeCosts(graph, prices, facts);

		const recipes = [...graph.values()].map(({ recipe }) => {
			const cost = costs.get(recipe.id);
			return {
				id: recipe.id,
				name: recipe.name,
				kind: recipe.kind,
				status: recipe.status,
				section: recipe.section,
				portions: Number(recipe.portions),
				lineCount: cost?.lines.length ?? 0,
				costPerPortionCents: cost?.costPerPortionCents ?? 0,
				grossPriceCents: cost?.grossPriceCents ?? null,
				foodCostPct: cost?.foodCostPct ?? null,
				marginCents: cost?.marginCents ?? null,
				marginPct: cost?.marginPct ?? null,
				missingPriceCount: cost?.missingPriceCount ?? 0,
				warnings: cost?.warnings ?? [],
				costDeltaPct: costDeltaPct(trend.perRecipe.get(recipe.id)),
			};
		});

		const priced = recipes.filter((r) => r.foodCostPct !== null);
		const avgFoodCost = priced.length
			? priced.reduce((sum, r) => sum + r.foodCostPct!, 0) / priced.length
			: null;
		const withMargin = recipes.filter((r) => r.marginCents !== null);
		const avgMarginCents = withMargin.length
			? Math.round(withMargin.reduce((sum, r) => sum + r.marginCents!, 0) / withMargin.length)
			: null;

		return {
			title: 'rec.title',
			period,
			trendData: {
				xLabels: trend.points.map(
					(pt) => MONTH_LABELS[Number.parseInt(pt.asOf.split('-')[1] ?? '0', 10) - 1] ?? pt.asOf
				),
				series: [{
					key: 'foodCost',
					label: 'rec.trend.foodCost',
					values: trend.points.map((pt) => pt.avgFoodCostPct === null ? 0 : Math.round(pt.avgFoodCostPct * 10) / 10),
				}],
			},
			recipes,
			sections: RECIPE_SECTIONS,
			statuses: RECIPE_STATUSES,
			avgFoodCost,
			avgMarginCents,
			missingPriceTotal: recipes.reduce((sum, r) => sum + r.missingPriceCount, 0),
			cycleCount: recipes.filter((r) => r.warnings.includes('cycle')).length,
			maxRecipes: entitlements?.maxRecipes ?? null,
			usedRecipes: recipes.filter((r) => r.status !== 'archived').length,
		};
	});
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		if (!(await rateLimitScoped({ scope: 'tenant', name: 'recipe-create', max: 30 }, { restaurantId: rid }))) {
			return fail(429, { error: 'rec.err.rateLimited' });
		}

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const rawKind = String(data.get('kind') ?? 'plato');
		const kind = isRecipeKind(rawKind) ? rawKind : 'plato';

		if (!name) return fail(422, { error: 'rec.err.nameRequired' });
		const nameKey = normalizeProductKey(name);
		if (!nameKey) return fail(422, { error: 'rec.err.nameRequired' });

		const entitlements = await locals.entitlements();
		const maxRecipes = entitlements?.maxRecipes ?? null;
		if (maxRecipes !== null && (await countRecipes(rid)) >= maxRecipes) {
			return fail(402, { error: 'rec.err.quota', max: maxRecipes });
		}

		// tenant-check-ok: inserts under rid from locals; the ON CONFLICT target
		// is (restaurant_id, name_key), so even the no-op path stays tenant-scoped.
		const rows = await db.execute<{ id: number }>(sql`
			INSERT INTO recipes (restaurant_id, name, name_key, kind)
			VALUES (${rid}, ${name}, ${nameKey}, ${kind})
			ON CONFLICT (restaurant_id, name_key) DO NOTHING
			RETURNING id
		`);

		if (rows.length === 0) return fail(409, { error: 'rec.err.duplicate' });
		redirect(303, `/recipes/${rows[0]!.id}`);
	},
};
