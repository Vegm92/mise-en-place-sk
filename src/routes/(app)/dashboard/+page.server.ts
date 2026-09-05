import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad } from './$types';
import { localToday, monthRange } from '$lib/server/period-range';
import { daysBetween, monthOf, previousRange } from '$lib/period';
import { db, forTenant } from '$lib/server/db';
import { invoices, categoryBudgets, settings, systemNotifications } from '$lib/server/schema';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin } from '$lib/server/category-spend';
import { desc, eq, isNull, sql, and } from 'drizzle-orm';
import { detectMissingInvoices } from '$lib/server/supplier-cadence';
import { moneyToNumber } from '$lib/server/money';
import { DEFAULT_DEVIATION_THRESHOLD, priceDeviations } from '$lib/server/price-deviations';
import type { PriceShockInput, UncategorizedInput } from '$lib/dashboard-turno';

function buildSparkData(
	sparkRows: Array<{ day: unknown; total: unknown }>,
	from: string,
	to: string,
): number[] {
	const map: Record<string, number> = {};
	for (const r of sparkRows) map[String(r.day)] = Number(r.total);
	const fromMs = new Date(from + 'T00:00:00Z').getTime();
	const toMs = new Date(to + 'T00:00:00Z').getTime();
	const days = Math.round((toMs - fromMs) / 86400000) + 1;
	return Array.from({ length: days }, (_, i) => {
		const key = new Date(fromMs + i * 86400000).toISOString().split('T')[0]!;
		return map[key] ?? 0;
	});
}

function buildProjection(
	thisMonth: number,
	daysElapsed: number,
	daysInMonth: number,
	isCurrentMonth: boolean,
	isPastMonth: boolean,
): { dailyRate: number; projectedEom: number; elapsedPct: number } {
	const dailyRate = isCurrentMonth && daysElapsed > 0 ? thisMonth / daysElapsed : 0;
	const projectedEom = isCurrentMonth ? Math.round(dailyRate * daysInMonth) : thisMonth;
	const elapsedPct = isCurrentMonth
		? Math.round((daysElapsed / daysInMonth) * 100)
		: (isPastMonth ? 100 : 0);
	return { dailyRate, projectedEom, elapsedPct };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const firstInvoice = url.searchParams.get('first_invoice') === '1';
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);

	return handleLoad('dashboard', async () => {
		const { rangeFrom, rangeTo } = await parent?.() ?? monthRange(url);
		const todayStr = localToday();
		const today = new Date(`${todayStr}T00:00:00Z`);
		const currentMonth = monthOf(todayStr);
		const selectedMonth = monthOf(rangeFrom);
		const { rangeFrom: prevFrom, rangeTo: prevTo } = previousRange(rangeFrom, rangeTo);
		const daysInRange = daysBetween(rangeFrom, rangeTo) + 1;
		const inRange = sql`${invoices.invoiceDate} >= ${rangeFrom}::date AND ${invoices.invoiceDate} <= ${rangeTo}::date`;

		const [
			reviewRow, momRow, sparkRows, catRows, budgetRows, thresholdRow, uncategorizedRows, invoiceRangeRow,
		] = await Promise.all([
			db.select({
				amount: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.reviewState} <> 'revisado' THEN COALESCE(${invoices.totalAmount},0) ELSE 0 END),0)::float8`,
				count: sql<number>`COUNT(CASE WHEN ${invoices.reviewState} <> 'revisado' THEN 1 END)`,
				incidencias: sql<number>`COUNT(CASE WHEN ${invoices.reviewState} = 'incidencia' THEN 1 END)`,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt))),

			db.select({
				this_month: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.invoiceDate} >= ${rangeFrom}::date AND ${invoices.invoiceDate} <= ${rangeTo}::date THEN COALESCE(${invoices.totalAmount},0) END),0)::float8`,
				last_month: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.invoiceDate} >= ${prevFrom}::date AND ${invoices.invoiceDate} <= ${prevTo}::date THEN COALESCE(${invoices.totalAmount},0) END),0)::float8`,
			})
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					isNull(invoices.deletedAt),
					sql`${invoices.invoiceDate} >= ${prevFrom}::date`
				)),

			db.select({ day: sql<string>`DATE(${invoices.invoiceDate})`, total: sql<number>`COALESCE(SUM(${invoices.totalAmount}),0)::float8` })
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt), inRange))
				.groupBy(sql`DATE(${invoices.invoiceDate})`)
				.orderBy(sql`DATE(${invoices.invoiceDate}) ASC`),

			db.execute(sql`
				SELECT ${lineCategoryExpr()} AS category,
				       COALESCE(SUM(${lineAmountExpr()}),0)::float8 AS total
				FROM invoice_line_items
				JOIN invoices i ON i.id = invoice_line_items.invoice_id
				JOIN suppliers ON suppliers.id = i.supplier_id
				${lineProductJoin()}
				WHERE i.restaurant_id = ${rid}
				  AND i.deleted_at IS NULL
				  AND ${describedLine()}
				  AND i.invoice_date >= ${rangeFrom}::date AND i.invoice_date <= ${rangeTo}::date
				GROUP BY ${lineCategoryExpr()}
				ORDER BY total DESC
			`),

			db.select({ category: categoryBudgets.category, monthly_budget: categoryBudgets.monthlyBudget })
				.from(categoryBudgets)
				.where(tdb.scope(categoryBudgets.restaurantId, eq(categoryBudgets.month, selectedMonth))),

			db.select({ value: settings.value })
				.from(settings)
				.where(tdb.scope(settings.restaurantId, eq(settings.key, 'price_alert_threshold'))),

			db.select({ id: systemNotifications.id, payload: systemNotifications.payload })
				.from(systemNotifications)
				.where(and(
					tdb.scope(systemNotifications.restaurantId),
					eq(systemNotifications.notificationType, 'supplier_uncategorized'),
					eq(systemNotifications.status, 'pending'),
				))
				.orderBy(desc(systemNotifications.createdAt))
				.limit(5),

			db.select({
				total: sql<number>`COUNT(*)`,
				in_month: sql<number>`COUNT(*) FILTER (WHERE ${invoices.invoiceDate} >= ${rangeFrom}::date AND ${invoices.invoiceDate} <= ${rangeTo}::date)`,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt))),
		]);

		const review = {
			amount: Number(reviewRow[0]?.amount ?? 0),
			count: Number(reviewRow[0]?.count ?? 0),
			incidencias: Number(reviewRow[0]?.incidencias ?? 0),
		};

		const mom = momRow[0] ?? { this_month: 0, last_month: 0 };
		const momPct = Number(mom.last_month) > 0
			? Math.round((Number(mom.this_month) - Number(mom.last_month)) / Number(mom.last_month) * 100)
			: null;

		const sparkData = buildSparkData(sparkRows, rangeFrom, rangeTo);

		const isCurrentPeriod = rangeFrom <= todayStr && rangeTo >= todayStr;
		const daysElapsed = isCurrentPeriod
			? daysBetween(rangeFrom, todayStr) + 1
			: (rangeTo < todayStr ? daysInRange : 0);
		const isCurrentMonth = isCurrentPeriod && selectedMonth === currentMonth;
		const proj = buildProjection(Number(mom.this_month), daysElapsed, daysInRange, isCurrentMonth, selectedMonth < currentMonth);

		type CatRow = { category: string; total: number };
		const categorySpendMap: Record<string, number> = {};
		for (const cat of catRows as unknown as CatRow[]) categorySpendMap[String(cat.category)] = Number(cat.total);

		const budgets: Record<string, number> = {};
		for (const row of budgetRows) budgets[row.category] = moneyToNumber(row.monthly_budget);
		const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);

		const uncategorized: UncategorizedInput[] = uncategorizedRows
			.map((r) => {
				const p = r.payload as { supplierId?: number; supplierName?: string } | null;
				return p?.supplierId != null && p.supplierName
					? { supplierId: p.supplierId, supplierName: p.supplierName }
					: null;
			})
			.filter((r): r is UncategorizedInput => r !== null);

		const rawThreshold = thresholdRow[0] ? parseFloat(thresholdRow[0].value) : NaN;
		const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 ? rawThreshold : DEFAULT_DEVIATION_THRESHOLD;
		const [deviations, missingInvoices] = await Promise.all([
			priceDeviations(rid, rangeFrom, rangeTo, threshold),
			detectMissingInvoices(rid, today),
		]);
		const turnoPriceShocks: PriceShockInput[] = deviations.slice(0, 10).map((d) => ({
			id: `${d.key}|${d.supplierId ?? d.supplierName}`,
			ingredient: d.description,
			supplier: d.supplierName,
			oldPrice: round2(d.referencePrice),
			newPrice: round2(d.latestPrice),
			deviationPct: d.deviationPct,
			extraPaid: round2(d.extraPaid),
			daysAgo: Math.max(0, daysBetween(d.lastDate, todayStr)),
			productId: d.productId,
			alternative: d.alternative
				? {
					supplier: d.alternative.supplierName,
					price: round2(d.alternative.price),
					savingsPct: d.alternative.savingsPct,
					potentialSavings: round2(d.alternative.potentialSavings),
				}
				: null,
		}));

		const invoiceRange = invoiceRangeRow[0] ?? { total: 0, in_month: 0 };
		const invoicesOutsideMonth = Math.max(Number(invoiceRange.total) - Number(invoiceRange.in_month), 0);

		return {
			title: 'dashboard.title', firstInvoice,
			selectedMonth, currentMonth,
			range_from: rangeFrom, range_to: rangeTo,
			review,
			category_spend_map: categorySpendMap,
			budgets, total_budget: totalBudget,
			missing_invoices: missingInvoices,
			uncategorized_suppliers: uncategorized,
			turno_price_shocks: turnoPriceShocks,
			is_current_month: isCurrentMonth,
			mom: { this_month: Number(mom.this_month), last_month: Number(mom.last_month), pct_change: momPct },
			spark_data: sparkData,
			projection: { daily_rate: proj.dailyRate, projected_eom: proj.projectedEom, elapsed_pct: proj.elapsedPct, days_elapsed: daysElapsed, days_in_month: daysInRange },
			invoices_outside_month: invoicesOutsideMonth,
		};
	});
};
