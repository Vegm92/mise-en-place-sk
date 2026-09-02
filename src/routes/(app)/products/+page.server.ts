import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { periodRange } from '$lib/server/period-range';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { normalizeProductKey } from '$lib/server/normalize';
import { loadConversionPrompts, loadCatalogYoyChangeMap } from '$lib/server/products';
import { selectableCategoryNames } from '$lib/server/categories';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { parseProductSort, sortProducts } from '$lib/product-filters';

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
	payload: Record<string, unknown> | null;
};

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const rid = locals.restaurantId!;
	const { rangeFrom, rangeTo } = await parent?.() ?? periodRange(url);
	const sort = parseProductSort(url.searchParams);
	const currentYear = new Date().getFullYear();

	return handleLoad('products', async () => {
		const [products, suggestionRows, trendRows, conversionPrompts, yoyByProduct] = await Promise.all([
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
				  AND created_at >= ${rangeFrom} AND created_at <= ${rangeTo}
				GROUP BY DATE_TRUNC('month', created_at)
				ORDER BY DATE_TRUNC('month', created_at) ASC
			`),

			loadConversionPrompts(db, rid),
			loadCatalogYoyChangeMap(db, rid, currentYear),
		]);

		const suggestions = suggestionRows.map((row) => {
			const payload = row.payload ?? {};
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
				values: trendRows.map(r => Number(r.count)),
			}],
		};

		const mappedProducts = products.map((p) => ({
			id:            p.id,
			canonicalName: p.canonical_name,
			category:      p.category,
			canonicalUnit: p.canonical_unit,
			unitsPerPack:  p.units_per_pack,
			baseUnit:      p.base_unit,
			supplierCount: p.supplier_count,
			aliasCount:    p.alias_count,
			needsConversion: p.canonical_unit != null && p.units_per_pack == null,
			yoyChangePct:  yoyByProduct.get(p.id) ?? null,
		}));

		return {
			title: 'nav.products',
			trendData,
			products: sortProducts(mappedProducts, sort),
			sort,
			suggestions,
			conversionPrompts,
			categories: await selectableCategoryNames(rid),
		};
	});
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		if (!(await rateLimitScoped({ scope: 'tenant', name: 'product-create', max: 30 }, { restaurantId: rid }))) {
			return fail(429, { error: 'Too many requests' });
		}

		const data = await request.formData();
		const canonicalName = String(data.get('canonicalName') ?? '').trim();
		const category      = String(data.get('category') ?? '').trim() || null;
		const canonicalUnit = String(data.get('canonicalUnit') ?? '').trim() || null;

		if (!canonicalName) return fail(422, { error: 'El nombre del producto es obligatorio' });

		const nameKey = normalizeProductKey(canonicalName);
		if (!nameKey) return fail(422, { error: 'El nombre del producto es obligatorio' });

		const cat = category && (await selectableCategoryNames(rid)).includes(category) ? category : null;

		// tenant-check-ok: inserts under rid from locals; the ON CONFLICT target
		// is (restaurant_id, name_key), so even the update path stays tenant-scoped.
		const rows = await db.execute<{ id: number }>(sql`
			INSERT INTO products (restaurant_id, canonical_name, name_key, category, canonical_unit)
			VALUES (${rid}, ${canonicalName}, ${nameKey}, ${cat}, ${canonicalUnit})
			ON CONFLICT (restaurant_id, name_key) DO UPDATE SET name_key = products.name_key
			RETURNING id
		`);

		redirect(303, `/products/${rows[0].id}`);
	},
};
