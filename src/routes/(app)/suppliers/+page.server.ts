import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db, forTenant } from '$lib/server/db';
import { suppliers, invoices, supplierMetrics } from '$lib/server/schema';
import { sql, eq, and } from 'drizzle-orm';
import { VALID_CATEGORIES, CATEGORY_COLORS, DAY_MS } from '$lib/constants';
import { computeAndCacheReliabilityScore } from '$lib/server/supplier-reliability';

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('suppliers', async () => {
		const today   = new Date().toISOString().slice(0, 10);
		const weekEnd = new Date(Date.now() + 7 * DAY_MS).toISOString().slice(0, 10);

		type PriceTrendRow = { supplier_id: number; month: string; avg_price: number };

		const [rows, metricsRows, priceTrendRows] = await Promise.all([
			db.select({
				id:               suppliers.id,
				name:             suppliers.name,
				cif:              suppliers.cif,
				createdAt:        suppliers.createdAt,
				category:         sql<string>`COALESCE(${suppliers.category}, 'Other')`.as('category'),
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
				.where(tdb.scope(suppliers.restaurantId))
				.groupBy(suppliers.id)
				.orderBy(sql`month_spend DESC`, suppliers.name),

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
		]);

		const metricsMap = new Map(metricsRows.map((m) => [m.supplierId, m]));

		const priceTrendMap = new Map<number, number[]>();
		for (const row of priceTrendRows) {
			const sid = Number(row.supplier_id);
			if (!priceTrendMap.has(sid)) priceTrendMap.set(sid, []);
			priceTrendMap.get(sid)!.push(Number(row.avg_price));
		}

		const yesterday = new Date(Date.now() - DAY_MS).toISOString();
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
			const badge: 'overdue' | 'due_soon' | 'paid_up' = Number(r.has_overdue)
				? 'overdue'
				: Number(r.has_due_soon) ? 'due_soon' : 'paid_up';

			const cat = r.category ?? 'Other';
			const metrics = metricsMap.get(r.id);
			const invoiceCount = Number(r.invoice_count);

			let stabilityLevel: 'stable' | 'moderate' | 'volatile' | null = null;
			if (metrics && invoiceCount >= 3) {
				const cv = metrics.priceStabilityCv ?? 100;
				stabilityLevel = cv < 5 ? 'stable' : cv <= 15 ? 'moderate' : 'volatile';
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
				month_invoice_count: Number(r.month_invoice_count),
				last_month_spend: lastMonthSpend,
				delta_pct: deltaPct,
				badge,
				color: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Other'],
				reliability_score: metrics && invoiceCount >= 3 ? metrics.score : null,
				stability_level: stabilityLevel,
				price_trend,
			};
		});

		return {
			title: 'nav.suppliers',
			subtitle: 'All active suppliers',
			suppliers: supplierList,
			categories: VALID_CATEGORIES,
		};
	});
};

