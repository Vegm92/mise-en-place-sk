import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { normalizeProductKey } from '$lib/server/normalize';
import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { isPeriodKey, periodRange, type PeriodKey } from '$lib/server/period';
import { getBudgetPills } from '$lib/server/budget-pills';

type ProductRow = {
	id: number;
	canonical_name: string;
	category: string | null;
	canonical_unit: string | null;
	units_per_pack: number | null;
	base_unit: string | null;
	supplier_count: number;
	alias_count: number;
	created_at: string;
};

type SuggestionRow = {
	id: number;
	message: string;
	payload: string | null;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const rid = locals.restaurantId!;

	return handleLoad('products', async () => {
		const periodParam = url.searchParams.get('period') ?? 'all';
		const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : 'all';
		const { from } = periodRange(period);
		const createdFilter = from ? sql`AND p.created_at >= ${from.toISOString()}` : sql``;

		const [products, suggestionRows, budget_pills] = await Promise.all([
			db.execute<ProductRow>(sql`
				SELECT p.id, p.canonical_name, p.category, p.canonical_unit, p.units_per_pack, p.base_unit, p.created_at,
				       (SELECT count(DISTINCT a.supplier_id) FROM product_aliases a
				          WHERE a.restaurant_id = ${rid} AND a.product_id = p.id AND a.supplier_id IS NOT NULL)::int AS supplier_count,
				       (SELECT count(*) FROM product_aliases a
				          WHERE a.restaurant_id = ${rid} AND a.product_id = p.id)::int AS alias_count
				FROM products p
				WHERE p.restaurant_id = ${rid}
				  ${createdFilter}
				ORDER BY p.canonical_name
			`),
			db.execute<SuggestionRow>(sql`
				SELECT id, message, payload FROM system_notifications
				WHERE restaurant_id = ${rid} AND notification_type = 'product_suggestion' AND status = 'pending'
				ORDER BY created_at DESC
			`),
			getBudgetPills(rid),
		]);

		// Volume of products catalogued over time, by category -- bucketed
		// daily within a month, monthly otherwise (same convention as the
		// other list pages' trend charts).
		const monthBucket = period === 'year' || period === 'all';
		function bucketKey(d: Date): string {
			const y = d.getFullYear();
			const m = String(d.getMonth() + 1).padStart(2, '0');
			if (monthBucket) return `${y}-${m}`;
			return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
		}
		const trendCounts = new Map<string, number>();
		for (const p of products) {
			const key = `${bucketKey(new Date(p.created_at))}|${p.category ?? 'Other'}`;
			trendCounts.set(key, (trendCounts.get(key) ?? 0) + 1);
		}
		const trend = [...trendCounts.entries()].map(([key, count]) => {
			const [bucket, category] = key.split('|');
			return { bucket, category, amount: count };
		});
		const trendCategoryTotals = new Map<string, number>();
		for (const t of trend) trendCategoryTotals.set(t.category, (trendCategoryTotals.get(t.category) ?? 0) + t.amount);
		const trendCategories = [...trendCategoryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);

		const suggestions = suggestionRows.map((row) => {
			const payload = row.payload ? JSON.parse(row.payload) : {};
			return {
				id: row.id,
				message: row.message,
				description: String(payload.description ?? ''),
				candidateName: payload.candidateName ? String(payload.candidateName) : null,
				score: typeof payload.score === 'number' ? payload.score : null,
			};
		});

		return {
			title: 'nav.products',
			products: products.map((p) => ({
				id:            p.id,
				canonicalName: p.canonical_name,
				category:      p.category ?? 'Other',
				canonicalUnit: p.canonical_unit,
				unitsPerPack:  p.units_per_pack,
				baseUnit:      p.base_unit,
				supplierCount: p.supplier_count,
				aliasCount:    p.alias_count,
				needsConversion: p.canonical_unit != null && p.units_per_pack == null,
			})),
			suggestions,
			categories: VALID_CATEGORIES,
			colors: CATEGORY_COLORS,
			period,
			trend,
			trendCategories,
			budget_pills,
		};
	});
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		if (!(await checkRateLimit(`product-create:${rid}`, 30))) {
			return fail(429, { error: 'Too many requests' });
		}

		const data = await request.formData();
		const canonicalName = String(data.get('canonicalName') ?? '').trim();
		const category      = String(data.get('category') ?? '').trim() || null;
		const canonicalUnit = String(data.get('canonicalUnit') ?? '').trim() || null;

		if (!canonicalName) return fail(422, { error: 'El nombre del producto es obligatorio' });

		const nameKey = normalizeProductKey(canonicalName);
		if (!nameKey) return fail(422, { error: 'El nombre del producto es obligatorio' });

		const cat = category && VALID_CATEGORIES.includes(category) ? category : null;

		const rows = await db.execute<{ id: number }>(sql`
			INSERT INTO products (restaurant_id, canonical_name, name_key, category, canonical_unit)
			VALUES (${rid}, ${canonicalName}, ${nameKey}, ${cat}, ${canonicalUnit})
			ON CONFLICT (restaurant_id, name_key) DO UPDATE SET name_key = products.name_key
			RETURNING id
		`);

		redirect(303, `/products/${rows[0].id}`);
	},
};
