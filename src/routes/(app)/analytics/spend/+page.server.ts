import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { sql, type SQL } from 'drizzle-orm';
import { CATEGORY_COLORS } from '$lib/constants';

// Month-based filters for mv_item_monthly_spend / mv_category_monthly_spend.
// Slightly coarser than exact date ranges (always full calendar months) but
// correct for analytics display.
const PERIOD_DATE_SQL: Record<string, SQL> = {
	month:   sql`AND i.invoice_date >= DATE_TRUNC('month', NOW())::text`,
	quarter: sql`AND i.invoice_date >= (NOW() - INTERVAL '3 months')::date::text`,
	half:    sql`AND i.invoice_date >= (NOW() - INTERVAL '6 months')::date::text`,
	all:     sql``,
};

const PERIOD_MONTH_FILTER: Record<string, SQL | null> = {
	month:   sql`AND m.month = TO_CHAR(NOW(), 'YYYY-MM')`,
	quarter: sql`AND m.month >= TO_CHAR((NOW() - INTERVAL '3 months')::date, 'YYYY-MM')`,
	half:    sql`AND m.month >= TO_CHAR((NOW() - INTERVAL '6 months')::date, 'YYYY-MM')`,
	all:     null,
};

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	try {
		let period = url.searchParams.get('period') ?? 'month';
		if (!(period in PERIOD_MONTH_FILTER)) period = 'month';
		const monthFilter = PERIOD_MONTH_FILTER[period];
		const monthFilterSql = monthFilter ?? sql``;
		const dateFilter = PERIOD_DATE_SQL[period]!;

		type TopItem = { description: string; total_spend: number; item_count: number; avg_unit_price: number | null; supplier_name: string };
		type CatRow = { category: string; total: number; invoice_count: number };
		type KpisRow = { total_items_spend: number | null; total_line_items: number; unique_items: number; avg_invoice_items: number | null };
		type ItemTrendRow = { item_key: string; month: string; avg_price: number };

		// topItems, categorySpend, itemTrendRows read from pre-aggregated views;
		// kpisRows still queries raw tables (it's one simple aggregate, no CTEs/window functions).
		const [topItems, categorySpend, kpisRows, itemTrendRows] = await Promise.all([
			db.execute<TopItem>(sql`
				SELECT
					MAX(m.description)    AS description,
					SUM(m.total_spend)    AS total_spend,
					SUM(m.line_count)     AS item_count,
					AVG(m.avg_unit_price) AS avg_unit_price,
					MAX(m.supplier_names) AS supplier_name
				FROM mv_item_monthly_spend m
				WHERE m.restaurant_id = ${rid}
				  ${monthFilterSql}
				GROUP BY m.item_key
				ORDER BY total_spend DESC
				LIMIT 15
			`),

			db.execute<CatRow>(sql`
				SELECT
					c.category,
					SUM(c.total_spend)    AS total,
					SUM(c.invoice_count)  AS invoice_count
				FROM mv_category_monthly_spend c
				WHERE c.restaurant_id = ${rid}
				  ${monthFilterSql}
				GROUP BY c.category
				ORDER BY total DESC
			`),

			db.execute<KpisRow>(sql`
				SELECT
					SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_items_spend,
					COUNT(*) AS total_line_items,
					COUNT(DISTINCT LOWER(TRIM(ili.description))) AS unique_items,
					COUNT(*)::float / NULLIF(COUNT(DISTINCT ili.invoice_id), 0) AS avg_invoice_items
				FROM invoice_line_items ili
				JOIN invoices i ON i.id = ili.invoice_id
				JOIN suppliers s ON s.id = i.supplier_id
				WHERE ili.description IS NOT NULL AND ili.description != ''
				  AND i.restaurant_id = ${rid}
				  ${dateFilter}
			`),

			db.execute<ItemTrendRow>(sql`
				SELECT
					m.item_key,
					m.month,
					m.avg_unit_price AS avg_price
				FROM mv_item_monthly_spend m
				WHERE m.restaurant_id = ${rid}
				  AND m.month >= TO_CHAR((NOW() - INTERVAL '6 months')::date, 'YYYY-MM')
				ORDER BY m.item_key, m.month ASC
			`),
		]);

		const itemTrendMap = new Map<string, number[]>();
		for (const row of itemTrendRows) {
			const key = String(row.item_key);
			if (!itemTrendMap.has(key)) itemTrendMap.set(key, []);
			itemTrendMap.get(key)!.push(Number(row.avg_price));
		}

		const maxSpend = Number(topItems[0]?.total_spend) || 1;
		const top_items = topItems.map(item => {
			const key = item.description.toLowerCase().trim();
			const rawTrend = itemTrendMap.get(key) ?? [];
			return {
				...item,
				total_spend: Number(item.total_spend),
				pct: Math.round((Number(item.total_spend) || 0) / maxSpend * 100),
				price_trend: rawTrend.length >= 2 ? rawTrend : [],
			};
		});

		const maxCat = Number(categorySpend[0]?.total) || 1;
		const category_spend = categorySpend.map(cat => ({
			category: String(cat.category),
			total: Number(cat.total),
			invoice_count: Number(cat.invoice_count),
			pct: Math.round((Number(cat.total) || 0) / maxCat * 100),
			color: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS['Other'],
		}));

		const kpis = kpisRows[0] ?? { total_items_spend: 0, total_line_items: 0, unique_items: 0, avg_invoice_items: null };

		return { title: 'Spend Analysis', top_items, category_spend, kpis, period };
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[analytics/spend] load failed', e);
		error(500, 'Failed to load spend analytics');
	}
};
