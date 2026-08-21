import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { sql, type SQL } from 'drizzle-orm';
import { CATEGORY_COLORS } from '$lib/constants';
import { moneyToNumber } from '$lib/server/money';
import { isPeriodKey, periodRange, deltaPct, type PeriodKey } from '$lib/server/period';
import { bucketSeries } from '$lib/server/period-series';

/** `mv_item_monthly_spend` / `mv_category_monthly_spend` are month-grained,
 * so 'day' falls back to the current month bucket — same as 'month'. */
const MONTH_BUCKET_FILTER: Record<PeriodKey, SQL | null> = {
	day:   sql`AND month = TO_CHAR(NOW(), 'YYYY-MM')`,
	month: sql`AND month = TO_CHAR(NOW(), 'YYYY-MM')`,
	year:  sql`AND month >= TO_CHAR(NOW(), 'YYYY') || '-01'`,
	all:   null,
};

function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function parseLocalDate(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d);
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	return handleLoad('analytics/spend', async () => {
		const periodParam = url.searchParams.get('period') ?? 'month';
		const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : 'month';
		const { from, prevFrom, prevTo } = periodRange(period);

		const monthFilterSql = MONTH_BUCKET_FILTER[period] ?? sql``;
		const dateFilter = from ? sql`AND i.invoice_date >= ${isoDate(from)}` : sql``;
		const prevDateFilter = (prevFrom && prevTo)
			? sql`AND i.invoice_date >= ${isoDate(prevFrom)} AND i.invoice_date < ${isoDate(prevTo)}`
			: null;

		type TopItem = { description: string; total_spend: string; item_count: number; avg_unit_price: string | null; supplier_name: string };
		type CatRow = { category: string; total: string; invoice_count: number };
		type KpisRow = { total_items_spend: string | null; total_line_items: number; unique_items: number; avg_invoice_items: number | null };
		type ItemTrendRow = { item_key: string; month: string; avg_price: string };
		type PrevKpisRow = { total_items_spend: string | null; total_line_items: number };
		type SeriesRow = { invoice_date: string; amount: string | null };

		const [topItems, categorySpend, kpisRows, itemTrendRows, prevKpisRows, seriesRows] = await Promise.all([
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

			prevDateFilter
				? db.execute<PrevKpisRow>(sql`
					SELECT
						SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_items_spend,
						COUNT(*) AS total_line_items
					FROM invoice_line_items ili
					JOIN invoices i ON i.id = ili.invoice_id
					WHERE ili.description IS NOT NULL AND ili.description != ''
					  AND i.restaurant_id = ${rid}
					  ${prevDateFilter}
				`)
				: Promise.resolve([]),

			prevFrom
				? db.execute<SeriesRow>(sql`
					SELECT i.invoice_date, COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0) AS amount
					FROM invoice_line_items ili
					JOIN invoices i ON i.id = ili.invoice_id
					WHERE ili.description IS NOT NULL AND ili.description != ''
					  AND i.restaurant_id = ${rid}
					  AND i.invoice_date >= ${isoDate(prevFrom)}
				`)
				: Promise.resolve([]),
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
			color: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS['Other'],
		}));

		const kpisRow0 = kpisRows[0];
		const currentSpend = moneyToNumber(kpisRow0?.total_items_spend ?? '0');
		const currentLineItems = kpisRow0?.total_line_items ?? 0;

		const prevRow0 = prevKpisRows[0];
		const prevSpend = prevRow0 ? moneyToNumber(prevRow0.total_items_spend ?? '0') : null;
		const prevLineItems = prevRow0 ? (prevRow0.total_line_items ?? 0) : null;

		const seriesInput = seriesRows.map(r => ({ createdAt: parseLocalDate(r.invoice_date), amount: moneyToNumber(r.amount ?? '0') }));
		const countSeriesInput = seriesInput.map(r => ({ createdAt: r.createdAt, amount: 1 }));
		const spendSeries = bucketSeries(seriesInput, period, from, prevFrom, prevTo);
		const lineItemsSeries = bucketSeries(countSeriesInput, period, from, prevFrom, prevTo);

		const kpis = {
			total_items_spend: currentSpend,
			total_line_items: currentLineItems,
			unique_items: kpisRow0?.unique_items ?? 0,
			avg_invoice_items: kpisRow0?.avg_invoice_items ?? null,
			spend_delta_pct: prevSpend !== null ? deltaPct(currentSpend, prevSpend) : null,
			line_items_delta_pct: prevLineItems !== null ? deltaPct(currentLineItems, prevLineItems) : null,
			spend_spark: spendSeries?.current ?? null,
			spend_spark_prev: spendSeries?.previous ?? null,
			line_items_spark: lineItemsSeries?.current ?? null,
			line_items_spark_prev: lineItemsSeries?.previous ?? null,
		};

		return { title: 'spend.pageTitle', top_items, category_spend, kpis, period };
	});
};
