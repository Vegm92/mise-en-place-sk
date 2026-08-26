import { fail, redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { normalizeProductKey } from '$lib/server/normalize';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { countRecipes, recipeCosts } from '$lib/server/recipes';
import { RECIPE_SECTIONS, RECIPE_STATUSES, isRecipeKind } from '$lib/recipes';
import { periodToDate } from '$lib/constants';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	const period = url.searchParams.get('period') ?? '90d';
	const periodStart = periodToDate(period).toISOString().slice(0, 10);

	return handleLoad('recipes', async () => {
		const [costs, trendRows, entitlements] = await Promise.all([
			recipeCosts(rid),
			db.execute<{ month: string; count: string }>(sql`
				SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
				FROM recipes
				WHERE restaurant_id = ${rid} AND created_at >= ${periodStart}
				GROUP BY DATE_TRUNC('month', created_at)
				ORDER BY DATE_TRUNC('month', created_at) ASC
			`),
			locals.entitlements(),
		]);

		const graphRows = await db.execute<{
			id: number; name: string; kind: string; status: string; section: string | null;
			portions: string; selling_price: string | null;
		}>(sql`
			SELECT id, name, kind, status, section, portions, selling_price
			FROM recipes WHERE restaurant_id = ${rid} ORDER BY name
		`);

		const recipes = graphRows.map((row) => {
			const cost = costs.get(Number(row.id));
			return {
				id: Number(row.id),
				name: row.name,
				kind: row.kind,
				status: row.status,
				section: row.section,
				portions: Number(row.portions),
				lineCount: cost?.lines.length ?? 0,
				costPerPortionCents: cost?.costPerPortionCents ?? 0,
				grossPriceCents: cost?.grossPriceCents ?? null,
				foodCostPct: cost?.foodCostPct ?? null,
				marginCents: cost?.marginCents ?? null,
				marginPct: cost?.marginPct ?? null,
				missingPriceCount: cost?.missingPriceCount ?? 0,
				warnings: cost?.warnings ?? [],
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
				xLabels: trendRows.map(
					(r) => MONTH_LABELS[Number.parseInt(r.month.split('-')[1], 10) - 1] ?? r.month
				),
				series: [{
					key: 'new',
					label: 'rec.trend.title',
					values: trendRows.map((r) => Number(r.count)),
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
		if (!(await checkRateLimit(`recipe-create:${rid}`, 30))) {
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

		const rows = await db.execute<{ id: number }>(sql`
			INSERT INTO recipes (restaurant_id, name, name_key, kind)
			VALUES (${rid}, ${name}, ${nameKey}, ${kind})
			ON CONFLICT (restaurant_id, name_key) DO NOTHING
			RETURNING id
		`);

		if (rows.length === 0) return fail(409, { error: 'rec.err.duplicate' });
		redirect(303, `/recipes/${rows[0].id}`);
	},
};
