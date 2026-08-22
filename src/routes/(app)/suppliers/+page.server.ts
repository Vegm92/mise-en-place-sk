import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db, forTenant } from '$lib/server/db';
import { suppliers, invoices, supplierMetrics } from '$lib/server/schema';
import { sql, eq, and, gte, lt, isNull } from 'drizzle-orm';
import { VALID_CATEGORIES, CATEGORY_COLORS, SUPPLIER_TYPES } from '$lib/constants';
import { computeAndCacheReliabilityScore } from '$lib/server/supplier-reliability';
import { isPeriodKey, periodRange, deltaPct, type PeriodKey } from '$lib/server/period';
import { bucketSeries } from '$lib/server/period-series';
import { moneyToNumber } from '$lib/server/money';

export const load: PageServerLoad = async ({ locals, url }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('suppliers', async () => {
		const periodParam = url.searchParams.get('period') ?? '';
		const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : 'month';
		const { from: periodFrom, prevFrom, prevTo } = periodRange(period);

		type PriceTrendRow = { supplier_id: number; month: string; avg_price: number };
		type PeriodStatsRow = { supplier_id: number; spend: number; invoice_count: number };
		type TrendRow = { bucket: string; category: string; supplierId: number; supplierName: string; amount: number };

		// 'year'/'all' bucket by month, everything else by day.
		const trendBucketExpr = (period === 'year' || period === 'all')
			? sql<string>`TO_CHAR(${invoices.createdAt}, 'YYYY-MM')`
			: sql<string>`TO_CHAR(${invoices.createdAt}, 'YYYY-MM-DD')`;

		const [rows, periodRows, prevPeriodRows, metricsRows, priceTrendRows, seriesRows, trendRows] = await Promise.all([
			db.select({
				id:               suppliers.id,
				name:             suppliers.name,
				cif:              suppliers.cif,
				createdAt:        suppliers.createdAt,
				category:         sql<string>`COALESCE(${suppliers.category}, 'Other')`.as('category'),
				type:             suppliers.type,
				tags:             suppliers.tags,
				total_spend:      sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`.as('total_spend'),
				invoice_count:    sql<number>`COUNT(${invoices.id})`.as('invoice_count'),
				last_invoice_date:   sql<string | null>`MAX(${invoices.invoiceDate})`.as('last_invoice_date'),
			})
				.from(suppliers)
				.leftJoin(invoices, and(eq(invoices.supplierId, suppliers.id), tdb.scope(invoices.restaurantId)))
				.where(tdb.scope(suppliers.restaurantId))
				.groupBy(suppliers.id)
				.orderBy(sql`total_spend DESC`, suppliers.name),

			db.select({
				supplier_id:   invoices.supplierId,
				spend:         sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`,
				invoice_count: sql<number>`COUNT(*)`,
			})
				.from(invoices)
				.where(tdb.scope(invoices.restaurantId, periodFrom
					? and(isNull(invoices.deletedAt), gte(invoices.createdAt, periodFrom))
					: isNull(invoices.deletedAt)))
				.groupBy(invoices.supplierId),

			prevFrom && prevTo
				? db.select({
					supplier_id:   invoices.supplierId,
					spend:         sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`,
					invoice_count: sql<number>`COUNT(*)`,
				})
					.from(invoices)
					.where(tdb.scope(invoices.restaurantId, and(isNull(invoices.deletedAt), gte(invoices.createdAt, prevFrom), lt(invoices.createdAt, prevTo))))
					.groupBy(invoices.supplierId)
				: Promise.resolve([] as PeriodStatsRow[]),

			db.select().from(supplierMetrics)
				.where(tdb.scope(supplierMetrics.restaurantId)),

			db.execute<PriceTrendRow>(sql`
				SELECT
					i.supplier_id,
					TO_CHAR(i.invoice_date, 'YYYY-MM') AS month,
					AVG(ili.unit_price) AS avg_price
				FROM invoice_line_items ili
				JOIN invoices i ON i.id = ili.invoice_id
				WHERE ili.unit_price IS NOT NULL
				  AND ili.description IS NOT NULL AND ili.description != ''
				  AND i.restaurant_id = ${rid}
				  AND i.invoice_date >= (NOW() - INTERVAL '6 months')::date
				GROUP BY i.supplier_id, TO_CHAR(i.invoice_date, 'YYYY-MM')
				ORDER BY i.supplier_id, month ASC
			`),

			prevFrom
				? db.select({ createdAt: invoices.createdAt, amount: invoices.totalAmount })
					.from(invoices)
					.where(tdb.scope(invoices.restaurantId, and(isNull(invoices.deletedAt), gte(invoices.createdAt, prevFrom))))
				: Promise.resolve([] as { createdAt: Date | null; amount: string | null }[]),

			db.select({
				bucket:       trendBucketExpr.as('bucket'),
				category:     sql<string>`COALESCE(${suppliers.category}, 'Other')`.as('category'),
				supplierId:   suppliers.id,
				supplierName: suppliers.name,
				amount:       sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`.as('amount'),
			})
				.from(invoices)
				.innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
				.where(tdb.scope(invoices.restaurantId, periodFrom
					? and(isNull(invoices.deletedAt), gte(invoices.createdAt, periodFrom))
					: isNull(invoices.deletedAt)))
				.groupBy(trendBucketExpr, sql`COALESCE(${suppliers.category}, 'Other')`, suppliers.id, suppliers.name)
				.orderBy(trendBucketExpr),
		]);

		const metricsMap = new Map(metricsRows.map((m) => [m.supplierId, m]));

		const periodMap = new Map(periodRows.map(r => [r.supplier_id, r]));
		const prevPeriodMap = new Map(prevPeriodRows.map(r => [r.supplier_id, r]));

		const priceTrendMap = new Map<number, number[]>();
		for (const row of priceTrendRows) {
			const sid = Number(row.supplier_id);
			if (!priceTrendMap.has(sid)) priceTrendMap.set(sid, []);
			priceTrendMap.get(sid)!.push(Number(row.avg_price));
		}

		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const staleRefreshes = rows
			.filter(row => Number(row.invoice_count) >= 3)
			.filter(row => {
				const cached = metricsMap.get(row.id);
				return !cached || ((cached.computedAt?.toISOString() ?? '') < yesterday);
			})
			.map(row => computeAndCacheReliabilityScore(row.id, rid).then(fresh => {
				metricsMap.set(row.id, { id: 0, supplierId: row.id, restaurantId: rid, ...fresh });
			}));

		await Promise.all(staleRefreshes);

		const favoriteIds = new Set(
			rows
				.filter(r => Number(r.invoice_count) >= 2)
				.sort((a, b) => Number(b.total_spend) - Number(a.total_spend))
				.slice(0, Math.max(1, Math.ceil(rows.length * 0.2)))
				.filter(r => Number(r.total_spend) > 0)
				.map(r => r.id)
		);

		const supplierList = rows.map((r) => {
			const cat = r.category ?? 'Other';
			const metrics = metricsMap.get(r.id);
			const invoiceCount = Number(r.invoice_count);

			let stabilityLevel: 'stable' | 'moderate' | 'volatile' | null = null;
			if (metrics && invoiceCount >= 3) {
				const cv = metrics.priceStabilityCv ?? 100;
				stabilityLevel = cv < 5 ? 'stable' : cv <= 15 ? 'moderate' : 'volatile';
			}

			const periodSpend = Number(periodMap.get(r.id)?.spend ?? 0);
			const periodInvoiceCount = Number(periodMap.get(r.id)?.invoice_count ?? 0);
			const prevPeriodSpend = prevPeriodMap.get(r.id)?.spend != null ? Number(prevPeriodMap.get(r.id)!.spend) : null;
			const supplierDeltaPct = prevPeriodSpend !== null ? deltaPct(periodSpend, prevPeriodSpend) : null;

			const rawTrend = priceTrendMap.get(r.id) ?? [];
			const price_trend = rawTrend.length >= 3 ? rawTrend : [];

			return {
				...r,
				invoice_count: invoiceCount,
				total_spend: Number(r.total_spend),
				month_spend: periodSpend,
				month_invoice_count: periodInvoiceCount,
				delta_pct: supplierDeltaPct,
				is_favorite: favoriteIds.has(r.id),
				color: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Other'],
				reliability_score: metrics && invoiceCount >= 3 ? metrics.score : null,
				stability_level: stabilityLevel,
				price_trend,
			};
		});

		const seriesInput = seriesRows
			.filter((r): r is { createdAt: Date; amount: string | null } => r.createdAt != null)
			.map(r => ({ createdAt: r.createdAt, amount: moneyToNumber(r.amount ?? '0') }));
		const countSeriesInput = seriesInput.map(r => ({ createdAt: r.createdAt, amount: 1 }));
		const spendSeries = bucketSeries(seriesInput, period, periodFrom, prevFrom, prevTo);
		const invoiceCountSeries = bucketSeries(countSeriesInput, period, periodFrom, prevFrom, prevTo);

		const hasPrevPeriod = Boolean(prevFrom && prevTo);
		const periodTotalSpend = periodRows.reduce((s, r) => s + Number(r.spend), 0);
		const periodTotalInvoices = periodRows.reduce((s, r) => s + Number(r.invoice_count), 0);
		const prevPeriodTotalSpend = hasPrevPeriod
			? prevPeriodRows.reduce((s, r) => s + Number(r.spend), 0)
			: null;
		const prevPeriodTotalInvoices = hasPrevPeriod
			? prevPeriodRows.reduce((s, r) => s + Number(r.invoice_count), 0)
			: null;

		const trend = trendRows.map(r => ({
			bucket: r.bucket,
			category: r.category,
			supplierId: r.supplierId,
			supplierName: r.supplierName,
			amount: Number(r.amount),
		}));

		return {
			title: 'nav.suppliers',
			subtitle: 'All active suppliers',
			suppliers: supplierList,
			categories: VALID_CATEGORIES,
			supplierTypes: SUPPLIER_TYPES,
			period,
			trend,
			periodStats: {
				total_spend: periodTotalSpend,
				total_invoices: periodTotalInvoices,
				spend_delta_pct: prevPeriodTotalSpend !== null ? deltaPct(periodTotalSpend, prevPeriodTotalSpend) : null,
				invoices_delta_pct: prevPeriodTotalInvoices !== null ? deltaPct(periodTotalInvoices, prevPeriodTotalInvoices) : null,
				spend_spark: spendSeries?.current ?? null,
				spend_spark_prev: spendSeries?.previous ?? null,
				invoices_spark: invoiceCountSeries?.current ?? null,
				invoices_spark_prev: invoiceCountSeries?.previous ?? null,
			},
		};
	});
};

