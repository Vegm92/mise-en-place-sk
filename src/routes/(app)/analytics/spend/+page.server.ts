import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { sql, type SQL } from 'drizzle-orm';
import { CATEGORY_COLORS, TYPE_COLORS, categoryToType, type SupplierType } from '$lib/constants';
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
		// 'year'/'all' bucket by month (invoice_date has no time component, so
		// finer buckets than a day are meaningless); everything else buckets
		// daily.
		const trendBucketExpr = (period === 'year' || period === 'all')
			? sql`TO_CHAR(i.invoice_date, 'YYYY-MM')`
			: sql`TO_CHAR(i.invoice_date, 'YYYY-MM-DD')`;

		type TopItem = { description: string; total_spend: string; item_count: number; avg_unit_price: string | null; supplier_name: string };
		type TypeSpendRow = { category: string | null; product_name: string; total: string };
		type KpisRow = { total_items_spend: string | null; total_line_items: number; unique_items: number; avg_invoice_items: number | null };
		type ItemTrendRow = { item_key: string; month: string; avg_price: string };
		type PrevKpisRow = { total_items_spend: string | null; total_line_items: number };
		type SeriesRow = { invoice_date: string; amount: string | null };
		type RecurringSupplierRow = { supplier_name: string; invoice_count: number };
		type TrendRow = { bucket: string; category: string; amount: string };

		const [topItems, typeSpend, kpisRows, itemTrendRows, prevKpisRows, seriesRows, recurringSuppliers, trendRows] = await Promise.all([
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

			db.execute<TypeSpendRow>(sql`
				SELECT
					p.category AS category,
					p.canonical_name AS product_name,
					SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total
				FROM invoice_line_items ili
				JOIN invoices i ON i.id = ili.invoice_id
				JOIN products p ON p.id = ili.product_id
				WHERE ili.description IS NOT NULL AND ili.description != ''
				  AND i.restaurant_id = ${rid}
				  ${dateFilter}
				GROUP BY p.category, p.canonical_name
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

			db.execute<RecurringSupplierRow>(sql`
				SELECT s.name AS supplier_name, COUNT(*) AS invoice_count
				FROM invoices i
				JOIN suppliers s ON s.id = i.supplier_id
				WHERE i.restaurant_id = ${rid}
				  ${dateFilter}
				GROUP BY s.id, s.name
				ORDER BY invoice_count DESC
			`),

			db.execute<TrendRow>(sql`
				SELECT ${trendBucketExpr} AS bucket, COALESCE(p.category, 'Other') AS category,
					SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS amount
				FROM invoice_line_items ili
				JOIN invoices i ON i.id = ili.invoice_id
				LEFT JOIN products p ON p.id = ili.product_id
				WHERE ili.description IS NOT NULL AND ili.description != ''
				  AND i.restaurant_id = ${rid}
				  ${dateFilter}
				GROUP BY bucket, category
				ORDER BY bucket ASC
			`),
		]);

		const itemTrendMap = new Map<string, number[]>();
		const itemTrendPoints = new Map<string, { bucket: string; value: number }[]>();
		for (const row of itemTrendRows) {
			const key = String(row.item_key);
			if (!itemTrendMap.has(key)) itemTrendMap.set(key, []);
			itemTrendMap.get(key)!.push(moneyToNumber(row.avg_price));
			if (!itemTrendPoints.has(key)) itemTrendPoints.set(key, []);
			itemTrendPoints.get(key)!.push({ bucket: row.month, value: moneyToNumber(row.avg_price) });
		}

		const kpisRow0 = kpisRows[0];
		const currentSpend = moneyToNumber(kpisRow0?.total_items_spend ?? '0');
		const totalSpendForPct = currentSpend || 1;

		// `pct` sizes the bar relative to the #1 item (so the ranking reads well
		// even with a long tail); `pctOfTotal` is the number actually printed as
		// "X%" next to each item, so it must be a real share of total spend.
		const maxSpend = moneyToNumber(topItems[0]?.total_spend) || 1;
		const top_items = topItems.map(item => {
			const key = item.description.toLowerCase().trim();
			const rawTrend = itemTrendMap.get(key) ?? [];
			const spend = moneyToNumber(item.total_spend) || 0;
			return {
				...item,
				total_spend: spend,
				avg_unit_price: item.avg_unit_price == null ? null : moneyToNumber(item.avg_unit_price),
				pct: Math.round((spend / maxSpend) * 100),
				pctOfTotal: Math.round((spend / totalSpendForPct) * 100),
				price_trend: rawTrend.length >= 2 ? rawTrend : [],
			};
		});

		const most_expensive_item = top_items.reduce<typeof top_items[number] | null>((max, item) => {
			if (item.avg_unit_price == null) return max;
			if (max == null || item.avg_unit_price > (max.avg_unit_price ?? 0)) return item;
			return max;
		}, null);

		// Price history (not spend) for the "compare products" mode of the
		// trend chart — reuses the same 6-month window as top_items.price_trend.
		const priceTrendSeries = topItems.slice(0, 8).map(item => {
			const key = item.description.toLowerCase().trim();
			return { key, label: item.description, points: itemTrendPoints.get(key) ?? [] };
		}).filter(s => s.points.length >= 2);

		// Bebida/Comida/Otros, con desglose: Tipo -> categoría de producto -> producto.
		// Se agrupa desde el producto de cada línea (no del proveedor, que puede
		// vender de todo) en un único árbol de 3 niveles, para que el clic en un
		// nivel no necesite ir de nuevo al servidor.
		const typeMap = new Map<string, Map<string, Map<string, number>>>();
		for (const row of typeSpend) {
			const amount = moneyToNumber(row.total);
			const type = categoryToType(row.category) ?? 'Otros';
			const category = row.category ?? 'Other';
			if (!typeMap.has(type)) typeMap.set(type, new Map());
			const catMap = typeMap.get(type)!;
			if (!catMap.has(category)) catMap.set(category, new Map());
			const prodMap = catMap.get(category)!;
			prodMap.set(row.product_name, (prodMap.get(row.product_name) ?? 0) + amount);
		}
		let breakdownGrandTotal = 0;
		for (const catMap of typeMap.values()) for (const prodMap of catMap.values()) for (const t of prodMap.values()) breakdownGrandTotal += t;
		const breakdownTotalForPct = breakdownGrandTotal || 1;
		const type_breakdown = [...typeMap.entries()]
			.map(([type, catMap]) => {
				const categories = [...catMap.entries()]
					.map(([category, prodMap]) => {
						const products = [...prodMap.entries()]
							.map(([name, total]) => ({ name, total, pct: Math.round((total / breakdownTotalForPct) * 100) }))
							.sort((a, b) => b.total - a.total);
						const catTotal = products.reduce((s, p) => s + p.total, 0);
						return {
							category,
							total: catTotal,
							pct: Math.round((catTotal / breakdownTotalForPct) * 100),
							color: CATEGORY_COLORS[category] ?? CATEGORY_COLORS['Other'],
							products,
						};
					})
					.sort((a, b) => b.total - a.total);
				const typeTotal = categories.reduce((s, c) => s + c.total, 0);
				return {
					type,
					total: typeTotal,
					pct: Math.round((typeTotal / breakdownTotalForPct) * 100),
					color: TYPE_COLORS[type as SupplierType] ?? CATEGORY_COLORS['Other'],
					categories,
				};
			})
			.sort((a, b) => b.total - a.total);

		const prevRow0 = prevKpisRows[0];
		const prevSpend = prevRow0 ? moneyToNumber(prevRow0.total_items_spend ?? '0') : null;

		const seriesInput = seriesRows.map(r => ({ createdAt: parseLocalDate(r.invoice_date), amount: moneyToNumber(r.amount ?? '0') }));
		const spendSeries = bucketSeries(seriesInput, period, from, prevFrom, prevTo);

		const invoiceCount = recurringSuppliers.reduce((sum, r) => sum + Number(r.invoice_count), 0);
		const totalInvoiceCount = invoiceCount || 1;
		const recurring_suppliers = recurringSuppliers.slice(0, 6).map(r => ({
			name: r.supplier_name,
			count: Number(r.invoice_count),
			pct: Math.round((Number(r.invoice_count) / totalInvoiceCount) * 100),
		}));

		const trend = trendRows.map(r => ({
			bucket: r.bucket,
			category: r.category,
			amount: moneyToNumber(r.amount),
		}));

		// Sourced live from the same join as the trend chart (not the
		// mv_category_monthly_spend materialized view, which only refreshes on
		// a schedule) so this reflects invoices saved seconds ago.
		const categoryTotals = new Map<string, number>();
		for (const r of trend) categoryTotals.set(r.category, (categoryTotals.get(r.category) ?? 0) + r.amount);
		const rankedCategories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
		const trendCategories = rankedCategories.map(([category]) => category);

		const kpis = {
			total_items_spend: currentSpend,
			invoice_count: invoiceCount,
			spend_delta_pct: prevSpend !== null ? deltaPct(currentSpend, prevSpend) : null,
			spend_spark: spendSeries?.current ?? null,
			spend_spark_prev: spendSeries?.previous ?? null,
		};

		return { title: 'spend.pageTitle', top_items, most_expensive_item, type_breakdown, recurring_suppliers, kpis, period, trend, trendCategories, priceTrendSeries };
	});
};
