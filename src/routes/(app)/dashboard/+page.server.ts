import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, suppliers, categoryBudgets, settings, invoiceLineItems, systemNotifications } from '$lib/server/schema';
import { asc, desc, eq, isNotNull, isNull, sql, and } from 'drizzle-orm';
import { CATEGORY_COLORS, VALID_CATEGORIES } from '$lib/constants';
import { markInvoicePaid, markInvoiceUnpaid } from '$lib/server/invoice-status';

const MIN_SUPPLIER_GAP_DAYS      = 3;
const MISSING_INVOICE_MULTIPLIER = 1.5;
const WEEKLY_THRESHOLD_DAYS      = 10;
const BIWEEKLY_THRESHOLD_DAYS    = 20;
const MONTHLY_THRESHOLD_DAYS     = 45;

async function detectMissingInvoices(today: Date, restaurantId: string): Promise<{
	supplier_name: string;
	last_invoice: string;
	expected_by: string;
	days_late: number;
	frequency: string;
}[]> {
	const tdb = forTenant(restaurantId);
	const rows = await db
		.select({ supplier_name: suppliers.name, invoice_date: invoices.invoiceDate })
		.from(invoices)
		.innerJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNotNull(invoices.invoiceDate),
			isNull(invoices.deletedAt)
		))
		.orderBy(asc(suppliers.id), asc(invoices.invoiceDate));

	const supplierDates: Record<string, Set<string>> = {};
	for (const row of rows) {
		if (!row.supplier_name || !row.invoice_date) continue;
		if (!supplierDates[row.supplier_name]) supplierDates[row.supplier_name] = new Set();
		supplierDates[row.supplier_name].add(row.invoice_date);
	}

	const alerts: Awaited<ReturnType<typeof detectMissingInvoices>> = [];

	for (const [name, rawDates] of Object.entries(supplierDates)) {
		const dateObjs = [...rawDates].map((d) => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
		if (dateObjs.length < 2) continue;

		const gaps = dateObjs.slice(1).map((d, i) =>
			Math.round((d.getTime() - dateObjs[i]!.getTime()) / 86400000)
		);
		const sorted = [...gaps].sort((a, b) => a - b);
		const n = sorted.length;
		const medianGap = n % 2 === 0
			? ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2
			: sorted[Math.floor(n / 2)] ?? 0;

		if (medianGap < MIN_SUPPLIER_GAP_DAYS) continue;

		const last = dateObjs[dateObjs.length - 1];
		if (!last) continue;
		const daysSinceLast = Math.round((today.getTime() - last.getTime()) / 86400000);
		if (daysSinceLast <= MISSING_INVOICE_MULTIPLIER * medianGap) continue;

		const expectedBy = new Date(last.getTime() + medianGap * 86400000);
		const daysLate = Math.round((today.getTime() - expectedBy.getTime()) / 86400000);

		let frequency = 'periodic';
		if (medianGap <= WEEKLY_THRESHOLD_DAYS)         frequency = 'weekly';
		else if (medianGap <= BIWEEKLY_THRESHOLD_DAYS)  frequency = 'biweekly';
		else if (medianGap <= MONTHLY_THRESHOLD_DAYS)   frequency = 'monthly';

		alerts.push({
			supplier_name: name,
			last_invoice: last.toISOString().split('T')[0]!,
			expected_by: expectedBy.toISOString().split('T')[0]!,
			days_late: daysLate,
			frequency,
		});
	}

	return alerts.sort((a, b) => b.days_late - a.days_late);
}

function parseMonthParam(param: string | null, currentMonth: string): string {
	if (!param) return currentMonth;
	if (!/^\d{4}-\d{2}$/.test(param)) return currentMonth;
	const month = parseInt(param.slice(5, 7), 10);
	if (month < 1 || month > 12) return currentMonth;
	return param > currentMonth ? currentMonth : param;
}

function shiftMonth(ym: string, delta: number): string {
	let year = parseInt(ym.slice(0, 4), 10);
	let month = parseInt(ym.slice(5, 7), 10) + delta;
	while (month <= 0) { month += 12; year--; }
	while (month > 12) { month -= 12; year++; }
	return `${year}-${String(month).padStart(2, '0')}`;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const firstInvoice = url.searchParams.get('first_invoice') === '1';
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);

	return handleLoad('dashboard', async () => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayIso = today.toISOString().split('T')[0]!;
		const weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]!;
		const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0]!;

		const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
		const selectedMonth = parseMonthParam(url.searchParams.get('month'), currentMonth);
		const prevMonth = shiftMonth(selectedMonth, -1);

		const [
			overdueRow, dueWeekRow, pendingRow, paidMonthRow,
			momRow, sparkRows, activeSuppRow,
			supplierCountRow, supplierRows, catRows,
			budgetRows, thresholdRow,
			recentRows, pendingInvoiceRows,
			agingRow, avgInvoiceRow, reminderRows,
			priceShockRows, budgetAlertRows,
		] = await Promise.all([
			db.select({ count: sql<number>`COUNT(*)` })
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					eq(invoices.status, 'pending'),
					isNotNull(invoices.dueDate),
					isNull(invoices.deletedAt),
					sql`${invoices.dueDate} < ${todayIso}`
				)),

			db.select({ count: sql<number>`COUNT(*)`, amount: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)` })
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					eq(invoices.status, 'pending'),
					isNotNull(invoices.dueDate),
					isNull(invoices.deletedAt),
					sql`${invoices.dueDate} BETWEEN ${todayIso} AND ${weekEnd}`
				)),

			db.select({ amount: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`, count: sql<number>`COUNT(*)` })
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.status, 'pending'), isNull(invoices.deletedAt))),

			db.select({ amount: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`, count: sql<number>`COUNT(*)` })
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					eq(invoices.status, 'paid'),
					isNull(invoices.deletedAt),
					sql`TO_CHAR(${invoices.invoiceDate}::date, 'YYYY-MM') = ${selectedMonth}`
				)),

			db.select({
				this_month: sql<number>`COALESCE(SUM(CASE WHEN TO_CHAR(${invoices.invoiceDate}::date,'YYYY-MM')=${selectedMonth} THEN COALESCE(${invoices.totalAmount},0) END),0)`,
				last_month: sql<number>`COALESCE(SUM(CASE WHEN TO_CHAR(${invoices.invoiceDate}::date,'YYYY-MM')=${prevMonth} THEN COALESCE(${invoices.totalAmount},0) END),0)`,
			})
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					isNull(invoices.deletedAt),
					sql`TO_CHAR(${invoices.invoiceDate}::date,'YYYY-MM') >= ${prevMonth}`
				)),

			db.select({ day: sql<string>`DATE(${invoices.invoiceDate})`, total: sql<number>`COALESCE(SUM(${invoices.totalAmount}),0)` })
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					isNull(invoices.deletedAt),
					sql`TO_CHAR(${invoices.invoiceDate}::date,'YYYY-MM') = ${selectedMonth}`
				))
				.groupBy(sql`DATE(${invoices.invoiceDate})`)
				.orderBy(sql`DATE(${invoices.invoiceDate}) ASC`),

			db.select({
				this_month: sql<number>`COUNT(DISTINCT CASE WHEN TO_CHAR(${invoices.invoiceDate}::date,'YYYY-MM')=${selectedMonth} THEN ${invoices.supplierId} END)`,
				last_month: sql<number>`COUNT(DISTINCT CASE WHEN TO_CHAR(${invoices.invoiceDate}::date,'YYYY-MM')=${prevMonth} THEN ${invoices.supplierId} END)`,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt))),

			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(suppliers)
				.where(tdb.scope(suppliers.restaurantId)),

			db.execute(sql`
				SELECT s.id, s.name,
					COALESCE(s.category,'Other') AS category,
					COALESCE(SUM(CASE WHEN TO_CHAR(i.invoice_date::date,'YYYY-MM')=${selectedMonth} THEN COALESCE(i.total_amount,0) ELSE 0 END),0) AS month_spend,
					COALESCE(SUM(CASE WHEN TO_CHAR(i.invoice_date::date,'YYYY-MM')=${prevMonth} THEN COALESCE(i.total_amount,0) ELSE 0 END),0) AS prev_month_spend,
					COUNT(CASE WHEN i.status='pending' THEN 1 END) AS open_count,
					MAX(CASE WHEN i.status='pending' AND i.due_date IS NOT NULL AND i.due_date < ${todayIso} THEN 1 ELSE 0 END) AS has_overdue,
					MAX(CASE WHEN i.status='pending' AND i.due_date IS NOT NULL AND i.due_date BETWEEN ${todayIso} AND ${weekEnd} THEN 1 ELSE 0 END) AS has_due_soon
				FROM suppliers s
				LEFT JOIN invoices i ON i.supplier_id = s.id AND i.restaurant_id = ${rid} AND i.deleted_at IS NULL
				WHERE s.restaurant_id = ${rid}
				GROUP BY s.id ORDER BY month_spend DESC LIMIT 6
			`),

			db.execute(sql`
				SELECT COALESCE(s.category,'Other') AS category,
				       COALESCE(SUM(COALESCE(i.total_amount,0)),0) AS total
				FROM invoices i
				JOIN suppliers s ON i.supplier_id = s.id
				WHERE i.restaurant_id = ${rid}
				  AND i.deleted_at IS NULL
				  AND TO_CHAR(i.invoice_date::date,'YYYY-MM') = ${selectedMonth}
				GROUP BY COALESCE(s.category,'Other')
				ORDER BY total DESC
			`),

			db.select({ category: categoryBudgets.category, monthly_budget: categoryBudgets.monthlyBudget })
				.from(categoryBudgets)
				.where(tdb.scope(categoryBudgets.restaurantId)),

			db.select({ value: settings.value })
				.from(settings)
				.where(tdb.scope(settings.restaurantId, eq(settings.key, 'budget_warning_threshold'))),

			db.execute(sql`
				SELECT i.id, s.name AS supplier_name, i.invoice_number, i.invoice_date,
				       COALESCE(i.total_amount,0) AS display_amount,
				       COALESCE(i.status,'pending') AS status,
				       COUNT(li.id) AS item_count
				FROM invoices i
				LEFT JOIN suppliers s ON s.id = i.supplier_id
				LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
				WHERE i.restaurant_id = ${rid}
				  AND i.deleted_at IS NULL
				  AND TO_CHAR(i.invoice_date::date,'YYYY-MM') = ${selectedMonth}
				GROUP BY i.id, s.name ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT 6
			`),

			db.execute(sql`
				SELECT i.id, s.name AS supplier_name, i.invoice_number, i.invoice_date,
				       COALESCE(i.total_amount,0) AS display_amount,
				       COUNT(li.id) AS item_count
				FROM invoices i
				LEFT JOIN suppliers s ON s.id = i.supplier_id
				LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
				WHERE i.restaurant_id = ${rid} AND i.status = 'pending'
				  AND i.deleted_at IS NULL
				  AND TO_CHAR(i.invoice_date::date,'YYYY-MM') = ${selectedMonth}
				GROUP BY i.id, s.name ORDER BY i.created_at DESC LIMIT 5
			`),

			db.select({
				fresh: sql<number>`COUNT(CASE WHEN NOW()::date - COALESCE(${invoices.invoiceDate}::date,${invoices.createdAt}::date) <= 7 THEN 1 END)`,
				mid:   sql<number>`COUNT(CASE WHEN NOW()::date - COALESCE(${invoices.invoiceDate}::date,${invoices.createdAt}::date) BETWEEN 8 AND 30 THEN 1 END)`,
				old:   sql<number>`COUNT(CASE WHEN NOW()::date - COALESCE(${invoices.invoiceDate}::date,${invoices.createdAt}::date) > 30 THEN 1 END)`,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.status, 'pending'), isNull(invoices.deletedAt))),

			db.select({ avg: sql<number | null>`ROUND(AVG(${invoices.totalAmount})::numeric, 0)` })
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					isNotNull(invoices.totalAmount),
					isNull(invoices.deletedAt),
					sql`TO_CHAR(${invoices.invoiceDate}::date,'YYYY-MM') = ${selectedMonth}`
				)),

			db.execute(sql`
				SELECT i.id, s.name AS supplier_name, i.invoice_number,
				       i.due_date, COALESCE(i.total_amount,0) AS display_amount
				FROM invoices i
				LEFT JOIN suppliers s ON s.id = i.supplier_id
				WHERE i.restaurant_id = ${rid}
				  AND i.deleted_at IS NULL
				  AND i.status='pending' AND i.due_date IS NOT NULL AND i.due_date <= ${weekEnd}
				ORDER BY i.due_date ASC
			`),

			db.select({ id: systemNotifications.id, message: systemNotifications.message, payload: systemNotifications.payload, createdAt: systemNotifications.createdAt })
				.from(systemNotifications)
				.where(and(
					tdb.scope(systemNotifications.restaurantId),
					eq(systemNotifications.notificationType, 'price_shock'),
					eq(systemNotifications.status, 'pending'),
					sql`DATE(${systemNotifications.createdAt}) >= ${sevenDaysAgo}::date`
				))
				.orderBy(desc(systemNotifications.createdAt))
				.limit(10),

			db.select({ id: systemNotifications.id, message: systemNotifications.message, payload: systemNotifications.payload, createdAt: systemNotifications.createdAt })
				.from(systemNotifications)
				.where(and(
					tdb.scope(systemNotifications.restaurantId),
					eq(systemNotifications.notificationType, 'budget_overage'),
					eq(systemNotifications.status, 'pending'),
					sql`DATE(${systemNotifications.createdAt}) >= ${sevenDaysAgo}::date`
				))
				.orderBy(desc(systemNotifications.createdAt))
				.limit(5),
		]);

		const overdue   = { count: Number(overdueRow[0]?.count    ?? 0) };
		const dueWeek   = { count: Number(dueWeekRow[0]?.count    ?? 0), amount: Number(dueWeekRow[0]?.amount   ?? 0) };
		const pending   = { amount: Number(pendingRow[0]?.amount  ?? 0), count: Number(pendingRow[0]?.count     ?? 0) };
		const paidMonth = { amount: Number(paidMonthRow[0]?.amount ?? 0), count: Number(paidMonthRow[0]?.count  ?? 0) };

		const mom = momRow[0] ?? { this_month: 0, last_month: 0 };
		const momPct = Number(mom.last_month) > 0
			? Math.round((Number(mom.this_month) - Number(mom.last_month)) / Number(mom.last_month) * 100)
			: null;

		const selYear = parseInt(selectedMonth.slice(0, 4), 10);
		const selMonthNum = parseInt(selectedMonth.slice(5, 7), 10);
		const daysInMonth = new Date(selYear, selMonthNum, 0).getDate();
		const isCurrentMonth = selectedMonth === currentMonth;
		const isPastMonth = selectedMonth < currentMonth;

		// Sparkline — daily spend for selected month
		const sparkMap: Record<string, number> = {};
		for (const r of sparkRows) sparkMap[String(r.day)] = Number(r.total);
		const sparkData: number[] = [];
		for (let d = 1; d <= daysInMonth; d++) {
			const key = `${selectedMonth}-${String(d).padStart(2, '0')}`;
			sparkData.push(sparkMap[key] ?? 0);
		}

		const activeSuppRow0 = activeSuppRow[0] ?? { this_month: 0, last_month: 0 };
		const avgPerSupplier = Number(activeSuppRow0.this_month) > 0
			? Number(mom.this_month) / Number(activeSuppRow0.this_month)
			: null;
		const avgPerSupplierLast = Number(activeSuppRow0.last_month) > 0 && Number(mom.last_month) > 0
			? Number(mom.last_month) / Number(activeSuppRow0.last_month)
			: null;
		const avgPerSupplierDelta = avgPerSupplier && avgPerSupplierLast && avgPerSupplierLast > 0
			? Math.round((avgPerSupplier - avgPerSupplierLast) / avgPerSupplierLast * 100)
			: null;
		const daysElapsed = isCurrentMonth ? today.getDate() : (isPastMonth ? daysInMonth : 0);
		const dailyRate = isCurrentMonth && daysElapsed > 0 ? Number(mom.this_month) / daysElapsed : 0;
		const projectedEom = isCurrentMonth ? Math.round(dailyRate * daysInMonth) : Number(mom.this_month);
		const projectedElapsedPct = isCurrentMonth ? Math.round((daysElapsed / daysInMonth) * 100) : (isPastMonth ? 100 : 0);

		const supplierCount = Number(supplierCountRow[0]?.cnt ?? 0);

		type SupplierCardRow = { id: number; name: string; category: string; month_spend: number; prev_month_spend: number; open_count: number; has_overdue: number; has_due_soon: number };
		const supps = (supplierRows as unknown as SupplierCardRow[]).map((r) => {
			const delta = Number(r.prev_month_spend) > 0
				? Math.round((Number(r.month_spend) - Number(r.prev_month_spend)) / Number(r.prev_month_spend) * 100 * 10) / 10
				: null;
			return {
				...r,
				month_spend: Number(r.month_spend),
				prev_month_spend: Number(r.prev_month_spend),
				badge: Number(r.has_overdue) ? 'overdue' : Number(r.has_due_soon) ? 'due_soon' : 'paid_up',
				color: CATEGORY_COLORS[r.category] ?? CATEGORY_COLORS['Other'],
				delta,
			};
		});

		type CatRow = { category: string; total: number };
		const maxCat = Math.max(...(catRows as unknown as CatRow[]).map((c) => Number(c.total)), 1);
		const categorySpend = (catRows as unknown as CatRow[]).map((cat) => ({
			category: String(cat.category),
			total: Number(cat.total),
			pct: Math.round(Number(cat.total) / maxCat * 100),
			color: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS['Other'],
		}));
		const categorySpendMap: Record<string, number> = {};
		for (const cat of categorySpend) categorySpendMap[cat.category] = cat.total;

		const budgets: Record<string, number> = {};
		for (const row of budgetRows) budgets[row.category] = row.monthly_budget ?? 0;
		const threshold = thresholdRow[0] ? parseInt(thresholdRow[0].value, 10) : 80;

		const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);
		const totalSpent = Object.keys(budgets).reduce((sum, cat) => sum + (categorySpendMap[cat] ?? 0), 0);
		const totalPctActual = totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100 * 10) / 10 : 0;
		const totalPctBar = Math.min(totalPctActual, 100);

		// Alerts
		function relativeTime(iso: Date | string | null): string {
			if (!iso) return '';
			const diff = today.getTime() - new Date(iso).getTime();
			const h = Math.floor(diff / 3600000);
			if (h < 1)  return 'hace un momento';
			if (h < 24) return `hace ${h} h`;
			const d = Math.floor(h / 24);
			if (d === 1) return 'ayer';
			return `hace ${d} d`;
		}

		type AlertRow = { id: number; message: string; payload: string | null; createdAt: Date | null };
		type ParsedAlertRow = Omit<AlertRow, 'payload'> & { payload: Record<string, unknown> | null };
		const priceShockAlerts: ParsedAlertRow[] = (priceShockRows as AlertRow[]).map((a) => ({
			...a,
			payload: a.payload ? JSON.parse(a.payload) as Record<string, unknown> : null,
		}));

		type DashAlert = { id: string; sev: 'high' | 'med' | 'low'; kind: 'price' | 'budget' | 'due' | 'info'; text: string; detail: string; when: string; payload?: Record<string, unknown> | null };
		const dashboardAlerts: DashAlert[] = ([
			...priceShockAlerts.map((a) => {
				const p = a.payload as { ingredient?: string; supplier?: string; oldPrice?: number; newPrice?: number; deviationPct?: number } | null;
				const pct = p?.deviationPct != null ? Math.abs(p.deviationPct) : null;
				const dir = p?.deviationPct != null && p.deviationPct > 0 ? 'subió' : 'bajó';
				return {
					id: `ps-${a.id}`, sev: 'high' as const, kind: 'price' as const,
					text: p?.ingredient ? `${p.ingredient} ${dir} un ${pct}%` : a.message.replace(/^⚠️\s*/, ''),
					detail: p?.supplier ?? '', when: relativeTime(a.createdAt), payload: a.payload,
				};
			}),
			...(budgetAlertRows as AlertRow[]).map((a) => {
				const p = a.payload ? JSON.parse(a.payload) as { category?: string; pct?: number; level?: string } : null;
				const isExceeded = p?.level === 'exceeded';
				return {
					id: `ba-${a.id}`, sev: isExceeded ? 'high' as const : 'med' as const, kind: 'budget' as const,
					text: p?.category ? `${p.category} al ${p.pct}% del presupuesto mensual` : a.message.replace(/^[🔴🟡]\s*/, ''),
					detail: '', when: relativeTime(a.createdAt), payload: p,
				};
			}),
		] as DashAlert[]).sort((a, b) => {
				const rank: Record<'high' | 'med' | 'low', number> = { high: 0, med: 1, low: 2 };
				return rank[a.sev] - rank[b.sev];
			}).slice(0, 6);

		const highCount = dashboardAlerts.filter(a => a.sev === 'high').length;
		const medCount  = dashboardAlerts.filter(a => a.sev === 'med').length;

		const aging = agingRow[0] ?? { fresh: 0, mid: 0, old: 0 };
		const avgInvoice = avgInvoiceRow[0]?.avg ?? null;

		type ReminderRow = { id: number; supplier_name: string | null; invoice_number: string | null; due_date: string; display_amount: number };
		const reminders = (reminderRows as unknown as ReminderRow[]).map((r) => {
			const daysDelta = Math.round((new Date(r.due_date).getTime() - today.getTime()) / 86400000);
			return { ...r, days_delta: daysDelta, overdue: daysDelta < 0 };
		});

		const missingInvoices = await detectMissingInvoices(today, rid);
		const displayMonth = new Date(selectedMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

		type InvRow = { id: number; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; display_amount: number; status: string; item_count: number };
		return {
			title: 'Dashboard', subtitle: displayMonth + ' · EUR', firstInvoice,
			selectedMonth, currentMonth,
			overdue, due_week: dueWeek, pending, paid_month: paidMonth,
			supplier_count: supplierCount, suppliers: supps, category_spend: categorySpend,
			recent_invoices: recentRows as unknown as InvRow[],
			pending_invoices: pendingInvoiceRows as unknown as InvRow[],
			valid_categories: VALID_CATEGORIES, budgets,
			budget_threshold: threshold, category_spend_map: categorySpendMap,
			total_budget: totalBudget, total_spent: totalSpent,
			total_pct_bar: totalPctBar, total_pct_actual: totalPctActual,
			missing_invoices: missingInvoices, price_shock_alerts: priceShockAlerts,
			dashboard_alerts: dashboardAlerts, alert_counts: { high: highCount, med: medCount },
			reminders,
			mom: { this_month: Number(mom.this_month), last_month: Number(mom.last_month), pct_change: momPct },
			aging: { fresh: Number(aging.fresh), mid: Number(aging.mid), old: Number(aging.old) },
			avg_invoice: avgInvoice ? Number(avgInvoice) : null,
			avg_per_supplier: avgPerSupplier, avg_per_supplier_delta: avgPerSupplierDelta,
			spark_data: sparkData,
			projection: { daily_rate: dailyRate, projected_eom: projectedEom, elapsed_pct: projectedElapsedPct, days_elapsed: daysElapsed, days_in_month: daysInMonth },
		};
	});
};

// Guarded transitions (issue #243) — markPaid now also records paidAt (the
// reminders action always did) and markUnpaid clears the stale timestamps.
export const actions: Actions = {
	markPaid: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		const ok = await markInvoicePaid(id, locals.restaurantId!);
		redirect(303, ok ? '/dashboard' : '/dashboard?conflict=1');
	},
	markUnpaid: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		const ok = await markInvoiceUnpaid(id, locals.restaurantId!);
		redirect(303, ok ? '/dashboard' : '/dashboard?conflict=1');
	},
};
