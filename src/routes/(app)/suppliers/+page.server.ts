import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db, forTenant } from '$lib/server/db';
import { suppliers, invoices, supplierMetrics } from '$lib/server/schema';
import { sql, eq, and } from 'drizzle-orm';
import { UNCATEGORIZED_CATEGORY, VALID_CATEGORIES, periodToDate } from '$lib/constants';
import { computeAndCacheReliabilityScore } from '$lib/server/supplier-reliability';
import { parseSupplierListParams } from '$lib/supplier-list';
import {
	supplierCategoryExpr,
	supplierListFilter,
	supplierListOrderBy,
	supplierTotalSpendExpr,
} from '$lib/server/supplier-list-query';

function paymentBadge(hasOverdue: number, hasDueSoon: number): 'overdue' | 'due_soon' | 'paid_up' {
	if (hasOverdue) return 'overdue';
	if (hasDueSoon) return 'due_soon';
	return 'paid_up';
}

function stabilityFromCv(cv: number): 'stable' | 'moderate' | 'volatile' {
	if (cv < 5) return 'stable';
	if (cv <= 15) return 'moderate';
	return 'volatile';
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('suppliers', async () => {
		const period = url.searchParams.get('period') ?? '30d';
		const periodStart = periodToDate(period).toISOString().slice(0, 10);
		const listParams = parseSupplierListParams(url.searchParams);
		const today   = new Date().toISOString().slice(0, 10);
		const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

		type PriceTrendRow = { supplier_id: number; month: string; avg_price: number };
		type SpendTrendRow = { month: string; category: string; spend: string };

		const [rows, metricsRows, priceTrendRows, spendTrendRows, categoryRows] = await Promise.all([
			db.select({
				id:               suppliers.id,
				name:             suppliers.name,
				cif:              suppliers.cif,
				createdAt:        suppliers.createdAt,
				category:         supplierCategoryExpr().as('category'),
				total_spend:      supplierTotalSpendExpr().as('total_spend'),
				month_spend:      sql<number>`COALESCE(SUM(CASE WHEN TO_CHAR(${invoices.invoiceDate},'YYYY-MM')=TO_CHAR(NOW(),'YYYY-MM') THEN COALESCE(${invoices.totalAmount},0) ELSE 0 END),0)`.as('month_spend'),
				open_count:       sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' THEN 1 END)`.as('open_count'),
				invoice_count:    sql<number>`COUNT(${invoices.id})`.as('invoice_count'),
				last_invoice_date:   sql<string | null>`MAX(${invoices.invoiceDate})`.as('last_invoice_date'),
				has_overdue:         sql<number>`MAX(CASE WHEN ${invoices.status}='pending' AND ${invoices.dueDate} IS NOT NULL AND ${invoices.dueDate} < ${today} THEN 1 ELSE 0 END)`.as('has_overdue'),
				has_due_soon:        sql<number>`MAX(CASE WHEN ${invoices.status}='pending' AND ${invoices.dueDate} IS NOT NULL AND ${invoices.dueDate} BETWEEN ${today} AND ${weekEnd} THEN 1 ELSE 0 END)`.as('has_due_soon'),
				month_invoice_count: sql<number>`COALESCE(COUNT(CASE WHEN TO_CHAR(${invoices.invoiceDate},'YYYY-MM')=TO_CHAR(NOW(),'YYYY-MM') THEN 1 END),0)`.as('month_invoice_count'),
				last_month_spend:    sql<number>`COALESCE(SUM(CASE WHEN TO_CHAR(${invoices.invoiceDate},'YYYY-MM')=TO_CHAR(NOW()-INTERVAL'1 month','YYYY-MM') THEN COALESCE(${invoices.totalAmount},0) ELSE 0 END),0)`.as('last_month_spend'),
			})
				.from(suppliers)
				.leftJoin(invoices, and(eq(invoices.supplierId, suppliers.id), tdb.scope(invoices.restaurantId)))
				.leftJoin(supplierMetrics, and(eq(supplierMetrics.supplierId, suppliers.id), tdb.scope(supplierMetrics.restaurantId)))
				.where(tdb.scope(suppliers.restaurantId, supplierListFilter(tdb, listParams)))
				.groupBy(suppliers.id)
				.orderBy(...supplierListOrderBy(listParams.sort)),

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

			db.execute<SpendTrendRow>(sql`
				SELECT
					TO_CHAR(DATE_TRUNC('month', i.invoice_date), 'YYYY-MM') AS month,
					COALESCE(s.category, 'Other') AS category,
					COALESCE(SUM(i.total_amount::numeric), 0) AS spend
				FROM invoices i
				JOIN suppliers s ON s.id = i.supplier_id
				WHERE i.restaurant_id = ${rid}
				  AND i.deleted_at IS NULL
				  AND i.invoice_date >= ${periodStart}
				GROUP BY DATE_TRUNC('month', i.invoice_date), COALESCE(s.category, 'Other')
				ORDER BY DATE_TRUNC('month', i.invoice_date) ASC
			`),

			db.select({
				category: suppliers.category,
				supplier_count: sql<number>`COUNT(*)`.as('supplier_count'),
			})
				.from(suppliers)
				.where(tdb.scope(suppliers.restaurantId))
				.groupBy(suppliers.category),
		]);

		const categoryCounts: Record<string, number> = {};
		for (const row of categoryRows) {
			const key = row.category ?? UNCATEGORIZED_CATEGORY;
			categoryCounts[key] = (categoryCounts[key] ?? 0) + Number(row.supplier_count);
		}
		const orderedCategories = [...VALID_CATEGORIES].sort((a, b) =>
			(categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0)
			|| VALID_CATEGORIES.indexOf(a) - VALID_CATEGORIES.indexOf(b),
		);

		const metricsMap = new Map(metricsRows.map((m) => [m.supplierId, m]));

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

		const supplierList = rows.map((r) => {
			const badge = paymentBadge(Number(r.has_overdue), Number(r.has_due_soon));

			const cat = r.category ?? 'Other';
			const metrics = metricsMap.get(r.id);
			const invoiceCount = Number(r.invoice_count);

			let stabilityLevel: 'stable' | 'moderate' | 'volatile' | null = null;
			if (metrics && invoiceCount >= 3) {
				const cv = metrics.priceStabilityCv ?? 100;
				stabilityLevel = stabilityFromCv(cv);
			}

			const lastMonthSpend = Number(r.last_month_spend);
			const deltaPct = lastMonthSpend > 0
				? ((Number(r.month_spend) - lastMonthSpend) / lastMonthSpend) * 100
				: null;

			const rawTrend = priceTrendMap.get(r.id) ?? [];
			const price_trend = rawTrend.length >= 3 ? rawTrend : [];

			return {
				...r,
				invoice_count: invoiceCount,
				open_count: Number(r.open_count),
				month_spend: Number(r.month_spend),
				total_spend: Number(r.total_spend),
				month_invoice_count: Number(r.month_invoice_count),
				last_month_spend: lastMonthSpend,
				delta_pct: deltaPct,
				badge,
				category: cat,
				reliability_score: metrics && invoiceCount >= 3 ? metrics.score : null,
				stability_level: stabilityLevel,
				price_trend,
			};
		});

		const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
		const allMonths = [...new Set(spendTrendRows.map(r => r.month))].sort((a, b) => a.localeCompare(b));
		const allCats   = [...new Set(spendTrendRows.map(r => r.category))];
		const spendByMonthCat = new Map<string, Map<string, number>>();
		for (const r of spendTrendRows) {
			if (!spendByMonthCat.has(r.month)) spendByMonthCat.set(r.month, new Map());
			spendByMonthCat.get(r.month)!.set(r.category, Number(r.spend));
		}
		const trendData = {
			xLabels: allMonths.map(m => MONTH_LABELS[(Number.parseInt(m.split('-')[1], 10) - 1)] ?? m),
			series: allCats.map(cat => ({
				key: cat,
				label: cat,
				values: allMonths.map(m => spendByMonthCat.get(m)?.get(cat) ?? 0),
			})),
		};

		const filteredList = listParams.badge
			? supplierList.filter(s => s.badge === listParams.badge)
			: supplierList;

		return {
			title: 'nav.suppliers',
			subtitle: 'All active suppliers',
			suppliers: filteredList,
			categories: orderedCategories,
			categoryCounts,
			period,
			trendData,
			sort: listParams.sort,
			search: listParams.search,
			category: listParams.category,
			uncategorizedOnly: listParams.uncategorizedOnly,
			badge: listParams.badge,
		};
	});
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const category = String(data.get('category') ?? '');
		if (!name) error(400, 'Name is required');
		const cat = VALID_CATEGORIES.includes(category) ? category : null;
		const [row] = await db.insert(suppliers)
			.values({ restaurantId: rid, name, category: cat })
			.returning({ id: suppliers.id });
		redirect(303, `/suppliers/${row.id}`);
	},
};
