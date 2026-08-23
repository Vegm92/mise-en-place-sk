import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { normalizeProductKey } from '$lib/server/normalize';
import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';
import { checkRateLimit } from '$lib/server/rate-limiter';

type ProductRow = {
	id: number;
	canonical_name: string;
	category: string | null;
	canonical_unit: string | null;
	units_per_pack: number | null;
	base_unit: string | null;
	supplier_count: number;
	alias_count: number;
};

type SuggestionRow = {
	id: number;
	message: string;
	payload: string | null;
};

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	const period = url.searchParams.get('period') ?? '30d';

	return handleLoad('products', async () => {
		const [products, suggestionRows, trendRows] = await Promise.all([
			db.execute<ProductRow>(sql`
				SELECT p.id, p.canonical_name, p.category, p.canonical_unit, p.units_per_pack, p.base_unit,
				       (SELECT count(DISTINCT a.supplier_id) FROM product_aliases a
				          WHERE a.restaurant_id = ${rid} AND a.product_id = p.id AND a.supplier_id IS NOT NULL)::int AS supplier_count,
				       (SELECT count(*) FROM product_aliases a
				          WHERE a.restaurant_id = ${rid} AND a.product_id = p.id)::int AS alias_count
				FROM products p
				WHERE p.restaurant_id = ${rid}
				ORDER BY p.canonical_name
			`),
			db.execute<SuggestionRow>(sql`
				SELECT id, message, payload FROM system_notifications
				WHERE restaurant_id = ${rid} AND notification_type = 'product_suggestion' AND status = 'pending'
				ORDER BY created_at DESC
			`),

			db.execute<{ month: string; count: string }>(sql`
				SELECT
					TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
					COUNT(*) AS count
				FROM products
				WHERE restaurant_id = ${rid}
				  AND created_at >= (NOW() - INTERVAL '6 months')::date
				GROUP BY DATE_TRUNC('month', created_at)
				ORDER BY DATE_TRUNC('month', created_at) ASC
			`),
		]);

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

		const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
		const trendData = {
			xLabels: trendRows.map(r => MONTH_LABELS[(Number.parseInt(r.month.split('-')[1], 10) - 1)] ?? r.month),
			series: [{
				key: 'new',
				label: 'prod.trend.title',
				color: 'var(--mep-series-1)',
				values: trendRows.map(r => Number(r.count)),
			}],
		};

		return {
			title: 'nav.products',
			period,
			trendData,
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
