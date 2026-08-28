import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers, categoryBudgets, settings, systemNotifications } from '$lib/server/schema';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin } from '$lib/server/category-spend';
import { desc, eq, inArray, isNotNull, isNull, sql, and } from 'drizzle-orm';
import { VALID_CATEGORIES } from '$lib/constants';
import { markInvoicePaid, markInvoiceUnpaid } from '$lib/server/invoice-status';
import { parseMonthParam, shiftMonth } from '$lib/formatters';
import { getTrendDataByRange } from '$lib/server/trend';
import { detectMissingInvoices } from '$lib/server/supplier-cadence';
import { moneyToNumber } from '$lib/server/money';
import { CASH_OUT_HORIZON_DAYS } from '$lib/dashboard-turno';
import type { PayableInput, PriceShockInput, UncategorizedInput } from '$lib/dashboard-turno';

function relativeTime(iso: Date | string | null, today: Date): string {
	if (!iso) return '';
	const diff = today.getTime() - new Date(iso).getTime();
	const h = Math.floor(diff / 3600000);
	if (h < 1)  return 'hace un momento';
	if (h < 24) return `hace ${h} h`;
	const d = Math.floor(h / 24);
	if (d === 1) return 'ayer';
	return `hace ${d} d`;
}

function buildSparkData(
	sparkRows: Array<{ day: unknown; total: unknown }>,
	selectedMonth: string,
	daysInMonth: number,
): number[] {
	const map: Record<string, number> = {};
	for (const r of sparkRows) map[String(r.day)] = Number(r.total);
	return Array.from({ length: daysInMonth }, (_, i) =>
		map[`${selectedMonth}-${String(i + 1).padStart(2, '0')}`] ?? 0,
	);
}

type _AlertRow = { id: number; message: string; payload: Record<string, unknown> | null; createdAt: Date | null };
type _DashAlert = { id: string; sev: 'high' | 'med' | 'low'; kind: 'price' | 'budget' | 'due' | 'info'; text: string; detail: string; when: string; payload?: Record<string, unknown> | null; messageKey?: string; messageVars?: Record<string, string | number> };

function buildDashboardAlerts(
	priceShockRows: _AlertRow[],
	budgetAlertRows: _AlertRow[],
	today: Date,
): _DashAlert[] {
	const rank: Record<'high' | 'med' | 'low', number> = { high: 0, med: 1, low: 2 };
	const priceAlerts = priceShockRows.map((a) => {
		const p = a.payload as { ingredient?: string; supplier?: string; deviationPct?: number } | null;
		const pct = p?.deviationPct != null ? Math.abs(p.deviationPct) : null;
		const up = p?.deviationPct != null && p.deviationPct > 0;
		const shockKey = up ? 'dash.alert.priceShockUp' : 'dash.alert.priceShockDown';
		return {
			id: `ps-${a.id}`, sev: 'high' as const, kind: 'price' as const,
			text: a.message, detail: p?.supplier ?? '', when: relativeTime(a.createdAt, today),
			payload: a.payload,
			messageKey: p?.ingredient ? shockKey : undefined,
			messageVars: p?.ingredient ? { ingredient: p.ingredient, pct: pct ?? 0 } : undefined,
		};
	});
	const budgetAlerts = budgetAlertRows.map((a) => {
		const p = a.payload as { category?: string; pct?: number; level?: string } | null;
		return {
			id: `ba-${a.id}`, sev: p?.level === 'exceeded' ? 'high' as const : 'med' as const, kind: 'budget' as const,
			text: a.message, detail: '', when: relativeTime(a.createdAt, today), payload: p,
			messageKey: p?.category ? 'dash.alert.budgetPct' : undefined,
			messageVars: p?.category ? { category: p.category, pct: p.pct ?? 0 } : undefined,
		};
	});
	return ([...priceAlerts, ...budgetAlerts] as _DashAlert[]).sort((a, b) => rank[a.sev] - rank[b.sev]).slice(0, 6);
}

function buildProjection(
	p: { thisMonth: number; lastMonth: number; activeThis: number; activeLast: number },
	today: Date,
	selectedMonth: string,
	currentMonth: string,
	daysInMonth: number,
) {
	const avgPerSupplier = p.activeThis > 0 ? p.thisMonth / p.activeThis : null;
	const avgPerSupplierLast = p.activeLast > 0 && p.lastMonth > 0 ? p.lastMonth / p.activeLast : null;
	const avgPerSupplierDelta = avgPerSupplier && avgPerSupplierLast && avgPerSupplierLast > 0
		? Math.round((avgPerSupplier - avgPerSupplierLast) / avgPerSupplierLast * 100)
		: null;
	const isCurrentMonth = selectedMonth === currentMonth;
	const isPastMonth = selectedMonth < currentMonth;
	const elapsedWhenNotCurrent = isPastMonth ? daysInMonth : 0;
	const daysElapsed = isCurrentMonth ? today.getDate() : elapsedWhenNotCurrent;
	const dailyRate = isCurrentMonth && daysElapsed > 0 ? p.thisMonth / daysElapsed : 0;
	const projectedEom = isCurrentMonth ? Math.round(dailyRate * daysInMonth) : p.thisMonth;
	const elapsedPctWhenNotCurrent = isPastMonth ? 100 : 0;
	const projectedElapsedPct = isCurrentMonth ? Math.round((daysElapsed / daysInMonth) * 100) : elapsedPctWhenNotCurrent;
	return { avgPerSupplier, avgPerSupplierDelta, daysElapsed, dailyRate, projectedEom, projectedElapsedPct };
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
		const cashOutEnd = new Date(today.getTime() + CASH_OUT_HORIZON_DAYS * 86400000).toISOString().split('T')[0]!;
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
			cashOutRows, uncategorizedRows,
			priceShockRows, budgetAlertRows,
			trend, invoiceRangeRow,
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
					sql`TO_CHAR(${invoices.invoiceDate}, 'YYYY-MM') = ${selectedMonth}`
				)),

			db.select({
				this_month: sql<number>`COALESCE(SUM(CASE WHEN TO_CHAR(${invoices.invoiceDate},'YYYY-MM')=${selectedMonth} THEN COALESCE(${invoices.totalAmount},0) END),0)`,
				last_month: sql<number>`COALESCE(SUM(CASE WHEN TO_CHAR(${invoices.invoiceDate},'YYYY-MM')=${prevMonth} THEN COALESCE(${invoices.totalAmount},0) END),0)`,
			})
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					isNull(invoices.deletedAt),
					sql`TO_CHAR(${invoices.invoiceDate},'YYYY-MM') >= ${prevMonth}`
				)),

			db.select({ day: sql<string>`DATE(${invoices.invoiceDate})`, total: sql<number>`COALESCE(SUM(${invoices.totalAmount}),0)` })
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					isNull(invoices.deletedAt),
					sql`TO_CHAR(${invoices.invoiceDate},'YYYY-MM') = ${selectedMonth}`
				))
				.groupBy(sql`DATE(${invoices.invoiceDate})`)
				.orderBy(sql`DATE(${invoices.invoiceDate}) ASC`),

			db.select({
				this_month: sql<number>`COUNT(DISTINCT CASE WHEN TO_CHAR(${invoices.invoiceDate},'YYYY-MM')=${selectedMonth} THEN ${invoices.supplierId} END)`,
				last_month: sql<number>`COUNT(DISTINCT CASE WHEN TO_CHAR(${invoices.invoiceDate},'YYYY-MM')=${prevMonth} THEN ${invoices.supplierId} END)`,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt))),

			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(suppliers)
				.where(tdb.scope(suppliers.restaurantId)),

			db.execute(sql`
				SELECT s.id, s.name,
					COALESCE(s.category,'Other') AS category,
					COALESCE(SUM(CASE WHEN TO_CHAR(i.invoice_date,'YYYY-MM')=${selectedMonth} THEN COALESCE(i.total_amount,0) ELSE 0 END),0) AS month_spend,
					COALESCE(SUM(CASE WHEN TO_CHAR(i.invoice_date,'YYYY-MM')=${prevMonth} THEN COALESCE(i.total_amount,0) ELSE 0 END),0) AS prev_month_spend,
					COUNT(CASE WHEN i.status='pending' THEN 1 END) AS open_count,
					MAX(CASE WHEN i.status='pending' AND i.due_date IS NOT NULL AND i.due_date < ${todayIso} THEN 1 ELSE 0 END) AS has_overdue,
					MAX(CASE WHEN i.status='pending' AND i.due_date IS NOT NULL AND i.due_date BETWEEN ${todayIso} AND ${weekEnd} THEN 1 ELSE 0 END) AS has_due_soon
				FROM suppliers s
				LEFT JOIN invoices i ON i.supplier_id = s.id AND i.restaurant_id = ${rid} AND i.deleted_at IS NULL
				WHERE s.restaurant_id = ${rid}
				GROUP BY s.id ORDER BY month_spend DESC LIMIT 6
			`),

			db.execute(sql`
				SELECT ${lineCategoryExpr()} AS category,
				       COALESCE(SUM(${lineAmountExpr()}),0) AS total
				FROM invoice_line_items
				JOIN invoices i ON i.id = invoice_line_items.invoice_id
				JOIN suppliers ON suppliers.id = i.supplier_id
				${lineProductJoin()}
				WHERE i.restaurant_id = ${rid}
				  AND i.deleted_at IS NULL
				  AND ${describedLine()}
				  AND TO_CHAR(i.invoice_date,'YYYY-MM') = ${selectedMonth}
				GROUP BY ${lineCategoryExpr()}
				ORDER BY total DESC
			`),

			db.select({ category: categoryBudgets.category, monthly_budget: categoryBudgets.monthlyBudget })
				.from(categoryBudgets)
				.where(tdb.scope(categoryBudgets.restaurantId, eq(categoryBudgets.month, selectedMonth))),

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
				  AND TO_CHAR(i.invoice_date,'YYYY-MM') = ${selectedMonth}
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
				  AND TO_CHAR(i.invoice_date,'YYYY-MM') = ${selectedMonth}
				GROUP BY i.id, s.name ORDER BY i.created_at DESC LIMIT 5
			`),

			db.select({
				fresh: sql<number>`COUNT(CASE WHEN NOW()::date - COALESCE(${invoices.invoiceDate},${invoices.createdAt}::date) <= 7 THEN 1 END)`,
				mid:   sql<number>`COUNT(CASE WHEN NOW()::date - COALESCE(${invoices.invoiceDate},${invoices.createdAt}::date) BETWEEN 8 AND 30 THEN 1 END)`,
				old:   sql<number>`COUNT(CASE WHEN NOW()::date - COALESCE(${invoices.invoiceDate},${invoices.createdAt}::date) > 30 THEN 1 END)`,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.status, 'pending'), isNull(invoices.deletedAt))),

			db.select({ avg: sql<number | null>`ROUND(AVG(${invoices.totalAmount})::numeric, 0)` })
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					isNotNull(invoices.totalAmount),
					isNull(invoices.deletedAt),
					sql`TO_CHAR(${invoices.invoiceDate},'YYYY-MM') = ${selectedMonth}`
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

			db.execute(sql`
				SELECT i.id, s.name AS supplier_name, i.invoice_number,
				       i.due_date, COALESCE(i.total_amount,0) AS display_amount
				FROM invoices i
				LEFT JOIN suppliers s ON s.id = i.supplier_id
				WHERE i.restaurant_id = ${rid}
				  AND i.deleted_at IS NULL
				  AND i.status IN ('pending','accepted')
				  AND i.due_date IS NOT NULL AND i.due_date <= ${cashOutEnd}
				ORDER BY i.due_date ASC
			`),

			db.select({ id: systemNotifications.id, payload: systemNotifications.payload })
				.from(systemNotifications)
				.where(and(
					tdb.scope(systemNotifications.restaurantId),
					eq(systemNotifications.notificationType, 'supplier_uncategorized'),
					eq(systemNotifications.status, 'pending'),
				))
				.orderBy(desc(systemNotifications.createdAt))
				.limit(5),

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

			getTrendDataByRange(rid, '30d', 'weekly'),

			db.select({
				total: sql<number>`COUNT(*)`,
				in_month: sql<number>`COUNT(*) FILTER (WHERE TO_CHAR(${invoices.invoiceDate},'YYYY-MM') = ${selectedMonth})`,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt))),
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

		const sparkData = buildSparkData(sparkRows, selectedMonth, daysInMonth);

		const activeSuppRow0 = activeSuppRow[0] ?? { this_month: 0, last_month: 0 };
		const proj = buildProjection(
			{
				thisMonth: Number(mom.this_month),
				lastMonth: Number(mom.last_month),
				activeThis: Number(activeSuppRow0.this_month),
				activeLast: Number(activeSuppRow0.last_month),
			},
			today, selectedMonth, currentMonth, daysInMonth,
		);

		const supplierCount = Number(supplierCountRow[0]?.cnt ?? 0);

		type SupplierCardRow = { id: number; name: string; category: string; month_spend: number; prev_month_spend: number; open_count: number; has_overdue: number; has_due_soon: number };
		const supps = (supplierRows as unknown as SupplierCardRow[]).map((r) => {
			const delta = Number(r.prev_month_spend) > 0
				? Math.round((Number(r.month_spend) - Number(r.prev_month_spend)) / Number(r.prev_month_spend) * 100 * 10) / 10
				: null;
			const dueBadge = Number(r.has_due_soon) ? 'due_soon' : 'paid_up';
			return {
				...r,
				month_spend: Number(r.month_spend),
				prev_month_spend: Number(r.prev_month_spend),
				badge: Number(r.has_overdue) ? 'overdue' : dueBadge,
				delta,
			};
		});

		type CatRow = { category: string; total: number };
		const maxCat = Math.max(...(catRows as unknown as CatRow[]).map((c) => Number(c.total)), 1);
		const categorySpend = (catRows as unknown as CatRow[]).map((cat) => ({
			category: String(cat.category),
			total: Number(cat.total),
			pct: Math.round(Number(cat.total) / maxCat * 100),
		}));
		const categorySpendMap: Record<string, number> = {};
		for (const cat of categorySpend) categorySpendMap[cat.category] = cat.total;

		const budgets: Record<string, number> = {};
		for (const row of budgetRows) budgets[row.category] = moneyToNumber(row.monthly_budget);
		const threshold = thresholdRow[0] ? parseInt(thresholdRow[0].value, 10) : 80;

		const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);
		const totalSpent = Object.keys(budgets).reduce((sum, cat) => sum + (categorySpendMap[cat] ?? 0), 0);
		const totalPctActual = totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100 * 10) / 10 : 0;
		const totalPctBar = Math.min(totalPctActual, 100);

		type AlertRow = { id: number; message: string; payload: Record<string, unknown> | null; createdAt: Date | null };
		const priceShockAlerts: AlertRow[] = priceShockRows as AlertRow[];

		const dashboardAlerts = buildDashboardAlerts(priceShockRows as AlertRow[], budgetAlertRows as AlertRow[], today);
		const highCount = dashboardAlerts.filter(a => a.sev === 'high').length;
		const medCount  = dashboardAlerts.filter(a => a.sev === 'med').length;

		const aging = agingRow[0] ?? { fresh: 0, mid: 0, old: 0 };
		const avgInvoice = avgInvoiceRow[0]?.avg ?? null;

		type ReminderRow = { id: number; supplier_name: string | null; invoice_number: string | null; due_date: string; display_amount: number };
		const reminders = (reminderRows as unknown as ReminderRow[]).map((r) => {
			const daysDelta = Math.round((new Date(r.due_date).getTime() - today.getTime()) / 86400000);
			return { ...r, days_delta: daysDelta, overdue: daysDelta < 0 };
		});

		type CashOutRow = { id: number; supplier_name: string | null; invoice_number: string | null; due_date: string; display_amount: number };
		const payables: PayableInput[] = (cashOutRows as unknown as CashOutRow[]).map((r) => ({
			id: r.id,
			supplier_name: r.supplier_name,
			invoice_number: r.invoice_number,
			due_date: r.due_date,
			amount: Number(r.display_amount),
			days_delta: Math.round((new Date(r.due_date).getTime() - today.getTime()) / 86400000),
		}));

		const uncategorized: UncategorizedInput[] = uncategorizedRows
			.map((r) => {
				const p = r.payload as { supplierId?: number; supplierName?: string } | null;
				return p?.supplierId != null && p.supplierName
					? { supplierId: p.supplierId, supplierName: p.supplierName }
					: null;
			})
			.filter((r): r is UncategorizedInput => r !== null);

		const shockDescriptions = [...new Set(
			priceShockAlerts
				.map((a) => String((a.payload as { ingredient?: string } | null)?.ingredient ?? '').trim())
				.filter((d) => d.length > 0),
		)];
		const shockSpendRows = shockDescriptions.length > 0
			? await db
				.select({
					description: invoiceLineItems.description,
					spend: sql<number>`COALESCE(SUM(COALESCE(${invoiceLineItems.totalPrice},0)),0)`,
				})
				.from(invoiceLineItems)
				.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
				.where(and(
					tdb.scope(invoiceLineItems.restaurantId),
					isNull(invoices.deletedAt),
					inArray(invoiceLineItems.description, shockDescriptions),
					sql`TO_CHAR(${invoices.invoiceDate},'YYYY-MM') = ${selectedMonth}`,
				))
				.groupBy(invoiceLineItems.description)
			: [];
		const shockSpendByDescription = new Map<string, number>();
		for (const row of shockSpendRows) shockSpendByDescription.set(String(row.description), Number(row.spend));

		const turnoPriceShocks: PriceShockInput[] = priceShockAlerts
			.map((a) => {
				const p = a.payload as { ingredient?: string; supplier?: string; oldPrice?: number; newPrice?: number; deviationPct?: number } | null;
				if (!p?.ingredient || p.oldPrice == null || p.newPrice == null || p.deviationPct == null) return null;
				return {
					id: a.id,
					ingredient: p.ingredient,
					supplier: p.supplier ?? '',
					oldPrice: Number(p.oldPrice),
					newPrice: Number(p.newPrice),
					deviationPct: Number(p.deviationPct),
					monthSpend: shockSpendByDescription.get(p.ingredient.trim()) ?? 0,
					daysAgo: a.createdAt
						? Math.max(0, Math.round((today.getTime() - new Date(a.createdAt).getTime()) / 86400000))
						: 0,
				};
			})
			.filter((s): s is PriceShockInput => s !== null);

		const missingInvoices = await detectMissingInvoices(rid, today);
		const displayMonth = new Date(selectedMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

		const invoiceRange = invoiceRangeRow[0] ?? { total: 0, in_month: 0 };
		const invoicesOutsideMonth = Math.max(Number(invoiceRange.total) - Number(invoiceRange.in_month), 0);

		type InvRow = { id: number; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; display_amount: number; status: string; item_count: number };
		return {
			title: 'dashboard.title', subtitle: displayMonth + ' · EUR', firstInvoice,
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
			payables, uncategorized_suppliers: uncategorized, turno_price_shocks: turnoPriceShocks,
			is_current_month: selectedMonth === currentMonth,
			mom: { this_month: Number(mom.this_month), last_month: Number(mom.last_month), pct_change: momPct },
			aging: { fresh: Number(aging.fresh), mid: Number(aging.mid), old: Number(aging.old) },
			avg_invoice: avgInvoice ? Number(avgInvoice) : null,
			avg_per_supplier: proj.avgPerSupplier, avg_per_supplier_delta: proj.avgPerSupplierDelta,
			spark_data: sparkData,
			projection: { daily_rate: proj.dailyRate, projected_eom: proj.projectedEom, elapsed_pct: proj.projectedElapsedPct, days_elapsed: proj.daysElapsed, days_in_month: daysInMonth },
			trend,
			invoices_outside_month: invoicesOutsideMonth,
		};
	});
};

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
