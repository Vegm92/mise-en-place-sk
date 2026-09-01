import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { moneyToNumber } from '$lib/server/money';
import { periodRange } from '$lib/server/period-range';

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const rid = locals.restaurantId!;
	return handleLoad('analytics/spend', async () => {
		const { rangeFrom, rangeTo } = await parent?.() ?? periodRange(url);
		const monthFrom = rangeFrom.slice(0, 7);
		const monthTo   = rangeTo.slice(0, 7);

		type TopItem = { description: string; total_spend: string; item_count: number; avg_unit_price: string | null; supplier_name: string };
		type CatRow = { category: string; total: string; invoice_count: number };
		type KpisRow = { total_items_spend: string | null; total_line_items: number; unique_items: number; avg_invoice_items: number | null };
		type ItemTrendRow = { item_key: string; month: string; avg_price: string };
		type RangeCountRow = { total: string; in_range: string };
		type MonthlySpendRow = { month: string; total: string };

		const [topItems, categorySpend, kpisRows, itemTrendRows, rangeCountRows, monthlySpendRows] = await Promise.all([
			db.execute<TopItem>(sql`
				SELECT
					MAX(m.description)    AS description,
					SUM(m.total_spend)    AS total_spend,
					SUM(m.line_count)     AS item_count,
					AVG(m.avg_unit_price) AS avg_unit_price,
					MAX(m.supplier_names) AS supplier_name
				FROM mv_item_monthly_spend m
				WHERE m.restaurant_id = ${rid}
				  AND m.month >= ${monthFrom} AND m.month <= ${monthTo}
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
				  AND c.month >= ${monthFrom} AND c.month <= ${monthTo}
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
				  AND i.invoice_date >= ${rangeFrom}::date AND i.invoice_date <= ${rangeTo}::date
			`),

			db.execute<ItemTrendRow>(sql`
				SELECT
					m.item_key,
					m.month,
					m.avg_unit_price AS avg_price
				FROM mv_item_monthly_spend m
				WHERE m.restaurant_id = ${rid}
				  AND m.month >= ${monthFrom} AND m.month <= ${monthTo}
				ORDER BY m.item_key, m.month ASC
			`),

			db.execute<RangeCountRow>(sql`
				SELECT
					COUNT(*) AS total,
					COUNT(*) FILTER (WHERE i.invoice_date >= ${rangeFrom}::date AND i.invoice_date <= ${rangeTo}::date) AS in_range
				FROM invoices i
				WHERE i.restaurant_id = ${rid} AND i.deleted_at IS NULL
			`),

			db.execute<MonthlySpendRow>(sql`
				SELECT
					TO_CHAR(gs.month, 'YYYY-MM') AS month,
					COALESCE(SUM(c.total_spend), 0) AS total
				FROM generate_series(
					DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
					DATE_TRUNC('month', CURRENT_DATE),
					INTERVAL '1 month'
				) AS gs(month)
				LEFT JOIN mv_category_monthly_spend c
					ON c.restaurant_id = ${rid} AND c.month = TO_CHAR(gs.month, 'YYYY-MM')
				GROUP BY gs.month
				ORDER BY gs.month ASC
			`),
		]);

		const itemTrendMap = new Map<string, number[]>();
		for (const row of itemTrendRows) {
			const key = String(row.item_key);
			if (!itemTrendMap.has(key)) itemTrendMap.set(key, []);
			itemTrendMap.get(key)!.push(moneyToNumber(row.avg_price));
		}

		const maxSpend = moneyToNumber(topItems[0]?.total_spend) || 1;
		const top_items = topItems.map(item => {
			const key = item.description.toLowerCase().trim();
			const rawTrend = itemTrendMap.get(key) ?? [];
			return {
				...item,
				total_spend: moneyToNumber(item.total_spend),
				avg_unit_price: item.avg_unit_price == null ? null : moneyToNumber(item.avg_unit_price),
				pct: Math.round((moneyToNumber(item.total_spend) || 0) / maxSpend * 100),
				price_trend: rawTrend.length >= 2 ? rawTrend : [],
			};
		});

		const maxCat = moneyToNumber(categorySpend[0]?.total) || 1;
		const category_spend = categorySpend.map(cat => ({
			category: String(cat.category),
			total: moneyToNumber(cat.total),
			invoice_count: Number(cat.invoice_count),
			pct: Math.round((moneyToNumber(cat.total) || 0) / maxCat * 100),
		}));

		const kpisRow0 = kpisRows[0];
		const kpis = {
			total_items_spend: moneyToNumber(kpisRow0?.total_items_spend ?? '0'),
			total_line_items: kpisRow0?.total_line_items ?? 0,
			unique_items: kpisRow0?.unique_items ?? 0,
			avg_invoice_items: kpisRow0?.avg_invoice_items ?? null,
		};

		const totalInvoices = Number(rangeCountRows[0]?.total ?? 0);
		const invoicesInRange = Number(rangeCountRows[0]?.in_range ?? 0);

		const monthly_spend = monthlySpendRows.map(row => ({
			month: String(row.month),
			total: moneyToNumber(row.total),
		}));

		return {
			title: 'spend.pageTitle', top_items, category_spend, kpis, monthly_spend,
			has_invoices: totalInvoices > 0,
			invoices_outside_range: Math.max(totalInvoices - invoicesInRange, 0),
		};
	});
};
