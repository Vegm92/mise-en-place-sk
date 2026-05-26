import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { suppliers, invoices, supplierMetrics } from '$lib/server/schema';
import { sql, eq } from 'drizzle-orm';
import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';
import { computeAndCacheReliabilityScore } from '$lib/server/supplier-reliability';

export const load: PageServerLoad = async () => {
	try {
		const today = new Date().toISOString().slice(0, 10);
		const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

		const rows = db
			.select({
				id: suppliers.id,
				name: suppliers.name,
				category: sql<string>`COALESCE(${suppliers.category}, 'Other')`.as('category'),
				month_spend: sql<number>`
					COALESCE(SUM(CASE WHEN strftime('%Y-%m', ${invoices.invoiceDate}) = strftime('%Y-%m', 'now')
					              THEN COALESCE(${invoices.totalAmount}, 0) ELSE 0 END), 0)
				`.as('month_spend'),
				open_count: sql<number>`
					COUNT(CASE WHEN ${invoices.status} = 'pending' THEN 1 END)
				`.as('open_count'),
				invoice_count: sql<number>`COUNT(${invoices.id})`.as('invoice_count'),
				last_invoice_date: sql<string | null>`MAX(${invoices.invoiceDate})`.as('last_invoice_date'),
				has_overdue: sql<number>`
					MAX(CASE WHEN ${invoices.status}='pending' AND ${invoices.dueDate} IS NOT NULL AND ${invoices.dueDate} < ${today} THEN 1 ELSE 0 END)
				`.as('has_overdue'),
				has_due_soon: sql<number>`
					MAX(CASE WHEN ${invoices.status}='pending' AND ${invoices.dueDate} IS NOT NULL AND ${invoices.dueDate} BETWEEN ${today} AND ${weekEnd} THEN 1 ELSE 0 END)
				`.as('has_due_soon'),
			})
			.from(suppliers)
			.leftJoin(invoices, eq(invoices.supplierId, suppliers.id))
			.groupBy(suppliers.id)
			.orderBy(sql`month_spend DESC`, suppliers.name)
			.all();

		// Load all cached metrics
		const metricsRows = db.select().from(supplierMetrics).all();
		const metricsMap = new Map(metricsRows.map((m) => [m.supplierId, m]));

		// Refresh stale scores (>24h old) for suppliers with enough invoices
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		for (const row of rows) {
			if (row.invoice_count >= 3) {
				const cached = metricsMap.get(row.id);
				if (!cached || (cached.computedAt ?? '') < yesterday) {
					const fresh = computeAndCacheReliabilityScore(row.id);
					metricsMap.set(row.id, { id: 0, supplierId: row.id, ...fresh });
				}
			}
		}

		const supplierList = rows.map((r) => {
			let badge: 'overdue' | 'due_soon' | 'paid_up';
			if (r.has_overdue) badge = 'overdue';
			else if (r.has_due_soon) badge = 'due_soon';
			else badge = 'paid_up';

			const cat = r.category ?? 'Other';
			const metrics = metricsMap.get(r.id);

			let stabilityLevel: 'stable' | 'moderate' | 'volatile' | null = null;
			if (metrics && r.invoice_count >= 3) {
				const cv = metrics.priceStabilityCv ?? 100;
				if (cv < 5) stabilityLevel = 'stable';
				else if (cv <= 15) stabilityLevel = 'moderate';
				else stabilityLevel = 'volatile';
			}

			return {
				...r,
				badge,
				color: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['Other'],
				reliability_score: metrics && r.invoice_count >= 3 ? metrics.score : null,
				stability_level: stabilityLevel,
			};
		});

		return {
			title: 'Suppliers',
			subtitle: 'All active suppliers',
			suppliers: supplierList,
			categories: VALID_CATEGORIES,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[suppliers] load failed', e);
		error(500, 'Failed to load suppliers');
	}
};

export const actions: Actions = {
	setCategory: async ({ request }) => {
		const data = await request.formData();
		const supplierId = Number(data.get('supplier_id'));
		const category = String(data.get('category') ?? '');

		const cat = VALID_CATEGORIES.includes(category) ? category : null;
		db.update(suppliers).set({ category: cat }).where(eq(suppliers.id, supplierId)).run();

		redirect(303, '/suppliers');
	},
};
