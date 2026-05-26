import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invoices, suppliers, categoryBudgets, settings, invoiceLineItems, systemNotifications } from '$lib/server/schema';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import { CATEGORY_COLORS, VALID_CATEGORIES } from '$lib/constants';

const MIN_SUPPLIER_GAP_DAYS      = 3;
const MISSING_INVOICE_MULTIPLIER = 1.5;
const WEEKLY_THRESHOLD_DAYS      = 10;
const BIWEEKLY_THRESHOLD_DAYS    = 20;
const MONTHLY_THRESHOLD_DAYS     = 45;

function detectMissingInvoices(today: Date): {
	supplier_name: string;
	last_invoice: string;
	expected_by: string;
	days_late: number;
	frequency: string;
}[] {
	const rows = db
		.select({ supplier_name: suppliers.name, invoice_date: invoices.invoiceDate })
		.from(invoices)
		.innerJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(isNotNull(invoices.invoiceDate))
		.orderBy(asc(suppliers.id), asc(invoices.invoiceDate))
		.all() as { supplier_name: string; invoice_date: string }[];

	const supplierDates: Record<string, Set<string>> = {};
	for (const row of rows) {
		if (!supplierDates[row.supplier_name]) supplierDates[row.supplier_name] = new Set();
		supplierDates[row.supplier_name].add(row.invoice_date);
	}

	const alerts: ReturnType<typeof detectMissingInvoices> = [];

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
			last_invoice: last.toISOString().split('T')[0],
			expected_by: expectedBy.toISOString().split('T')[0],
			days_late: daysLate,
			frequency,
		});
	}

	return alerts.sort((a, b) => b.days_late - a.days_late);
}

export const load: PageServerLoad = async ({ url }) => {
	const firstInvoice = url.searchParams.get('first_invoice') === '1';
	try {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayIso = today.toISOString().split('T')[0];
	const weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];

	// ── Overdue / due-week / pending / paid-month ──────────────────────────
	const overdue = db.get<{ count: number }>(sql`
		SELECT COUNT(*) AS count FROM ${invoices}
		WHERE status='pending' AND due_date IS NOT NULL AND due_date < ${todayIso}
	`) ?? { count: 0 };

	const dueWeek = db.get<{ count: number; amount: number }>(sql`
		SELECT COUNT(*) AS count, COALESCE(SUM(COALESCE(total_amount,0)),0) AS amount
		FROM ${invoices}
		WHERE status='pending' AND due_date IS NOT NULL AND due_date BETWEEN ${todayIso} AND ${weekEnd}
	`) ?? { count: 0, amount: 0 };

	const pending = db.get<{ amount: number; count: number }>(sql`
		SELECT COALESCE(SUM(COALESCE(total_amount,0)),0) AS amount, COUNT(*) AS count
		FROM ${invoices} WHERE status='pending'
	`) ?? { amount: 0, count: 0 };

	const paidMonth = db.get<{ amount: number; count: number }>(sql`
		SELECT COALESCE(SUM(COALESCE(total_amount,0)),0) AS amount, COUNT(*) AS count
		FROM ${invoices}
		WHERE status='paid' AND strftime('%Y-%m',invoice_date)=strftime('%Y-%m','now')
	`) ?? { amount: 0, count: 0 };

	// ── Month-over-month spend ─────────────────────────────────────────────
	type MomRow = { this_month: number; last_month: number };
	const momRow = db.get<MomRow>(sql`
		SELECT
			COALESCE(SUM(CASE WHEN strftime('%Y-%m',invoice_date)=strftime('%Y-%m','now') THEN COALESCE(total_amount,0) END),0) AS this_month,
			COALESCE(SUM(CASE WHEN strftime('%Y-%m',invoice_date)=strftime('%Y-%m',date('now','-1 month')) THEN COALESCE(total_amount,0) END),0) AS last_month
		FROM ${invoices} WHERE invoice_date >= date('now','-2 months')
	`) ?? { this_month: 0, last_month: 0 };
	const momPct = momRow.last_month > 0
		? Math.round((momRow.this_month - momRow.last_month) / momRow.last_month * 100)
		: null;

	// ── Sparkline: 14-day daily spend ─────────────────────────────────────
	type SparkRow = { day: string; total: number };
	const sparkRows = db.all<SparkRow>(sql`
		SELECT date(invoice_date) AS day, COALESCE(SUM(total_amount),0) AS total
		FROM ${invoices}
		WHERE invoice_date >= date('now','-13 days')
		GROUP BY day ORDER BY day ASC
	`);
	const sparkMap: Record<string, number> = {};
	for (const r of sparkRows) sparkMap[r.day] = r.total;
	const sparkData: number[] = [];
	for (let i = 13; i >= 0; i--) {
		const d = new Date(today.getTime() - i * 86400000).toISOString().split('T')[0];
		sparkData.push(sparkMap[d] ?? 0);
	}

	// ── Avg per supplier + delta ───────────────────────────────────────────
	const activeSuppRow = db.get<{ this_month: number; last_month: number }>(sql`
		SELECT
			COUNT(DISTINCT CASE WHEN strftime('%Y-%m',invoice_date)=strftime('%Y-%m','now') THEN supplier_id END) AS this_month,
			COUNT(DISTINCT CASE WHEN strftime('%Y-%m',invoice_date)=strftime('%Y-%m',date('now','-1 month')) THEN supplier_id END) AS last_month
		FROM ${invoices}
	`) ?? { this_month: 0, last_month: 0 };

	const avgPerSupplier = activeSuppRow.this_month > 0 ? momRow.this_month / activeSuppRow.this_month : null;
	const avgPerSupplierLast = activeSuppRow.last_month > 0 && momRow.last_month > 0
		? momRow.last_month / activeSuppRow.last_month : null;
	const avgPerSupplierDelta = avgPerSupplier && avgPerSupplierLast && avgPerSupplierLast > 0
		? Math.round((avgPerSupplier - avgPerSupplierLast) / avgPerSupplierLast * 100)
		: null;

	// ── Projection bar ────────────────────────────────────────────────────
	const daysElapsed = today.getDate();
	const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
	const dailyRate = daysElapsed > 0 ? momRow.this_month / daysElapsed : 0;
	const projectedEom = Math.round(dailyRate * daysInMonth);
	const projectedElapsedPct = Math.round((daysElapsed / daysInMonth) * 100);

	// ── Supplier count ─────────────────────────────────────────────────────
	const supplierCountRow = db.get<{ cnt: number }>(sql`SELECT COUNT(*) AS cnt FROM ${suppliers}`);
	const supplierCount = supplierCountRow?.cnt ?? 0;

	// ── Suppliers with prev-month delta ───────────────────────────────────
	type SupplierCardRow = {
		id: number; name: string; category: string;
		month_spend: number; prev_month_spend: number;
		open_count: number; has_overdue: number; has_due_soon: number;
	};
	const supplierRows = db.all<SupplierCardRow>(sql`
		SELECT
			s.id, s.name,
			COALESCE(s.category,'Other') AS category,
			COALESCE(SUM(CASE WHEN strftime('%Y-%m',i.invoice_date)=strftime('%Y-%m','now') THEN COALESCE(i.total_amount,0) ELSE 0 END),0) AS month_spend,
			COALESCE(SUM(CASE WHEN strftime('%Y-%m',i.invoice_date)=strftime('%Y-%m',date('now','-1 month')) THEN COALESCE(i.total_amount,0) ELSE 0 END),0) AS prev_month_spend,
			COUNT(CASE WHEN i.status='pending' THEN 1 END) AS open_count,
			MAX(CASE WHEN i.status='pending' AND i.due_date IS NOT NULL AND i.due_date < ${todayIso} THEN 1 ELSE 0 END) AS has_overdue,
			MAX(CASE WHEN i.status='pending' AND i.due_date IS NOT NULL AND i.due_date BETWEEN ${todayIso} AND ${weekEnd} THEN 1 ELSE 0 END) AS has_due_soon
		FROM ${suppliers} s
		LEFT JOIN ${invoices} i ON i.supplier_id = s.id
		GROUP BY s.id
		ORDER BY month_spend DESC
		LIMIT 6
	`);

	const supps = supplierRows.map((r) => {
		const delta = r.prev_month_spend > 0
			? Math.round((r.month_spend - r.prev_month_spend) / r.prev_month_spend * 100 * 10) / 10
			: null;
		return {
			...r,
			badge: r.has_overdue ? 'overdue' : r.has_due_soon ? 'due_soon' : 'paid_up',
			color: CATEGORY_COLORS[r.category] ?? CATEGORY_COLORS['Other'],
			delta,
		};
	});

	// ── Category spend ────────────────────────────────────────────────────
	type CatRow = { category: string; total: number };
	const catRows = db.all<CatRow>(sql`
		SELECT COALESCE(s.category,'Other') AS category,
		       COALESCE(SUM(COALESCE(i.total_amount,0)),0) AS total
		FROM ${invoices} i
		JOIN ${suppliers} s ON i.supplier_id = s.id
		WHERE strftime('%Y-%m',i.invoice_date)=strftime('%Y-%m','now')
		GROUP BY COALESCE(s.category,'Other')
		ORDER BY total DESC
	`);

	const maxCat = Math.max(...catRows.map((c) => c.total), 1);
	const categorySpend = catRows.map((cat) => ({
		...cat,
		pct: Math.round(cat.total / maxCat * 100),
		color: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS['Other'],
	}));

	const categorySpendMap: Record<string, number> = {};
	for (const cat of categorySpend) categorySpendMap[cat.category] = cat.total;

	// ── Budgets ───────────────────────────────────────────────────────────
	const budgetRows = db
		.select({ category: categoryBudgets.category, monthly_budget: categoryBudgets.monthlyBudget })
		.from(categoryBudgets)
		.all();
	const budgets: Record<string, number> = {};
	for (const row of budgetRows) budgets[row.category] = row.monthly_budget;

	const THRESHOLD_KEY = 'budget_warning_threshold';
	const thresholdRow = db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, THRESHOLD_KEY))
		.get();
	const threshold = thresholdRow ? parseInt(thresholdRow.value, 10) : 80;

	const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);
	const totalSpent = Object.keys(budgets).reduce((sum, cat) => sum + (categorySpendMap[cat] ?? 0), 0);
	const totalPctActual = totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100 * 10) / 10 : 0;
	const totalPctBar = Math.min(totalPctActual, 100);

	// ── Recent invoices (extended) ────────────────────────────────────────
	type RecentRow = {
		id: number; supplier_name: string | null; invoice_number: string | null;
		invoice_date: string | null; display_amount: number; status: string; item_count: number;
	};
	const recent = db.all<RecentRow>(sql`
		SELECT i.id, s.name AS supplier_name, i.invoice_number, i.invoice_date,
		       COALESCE(i.total_amount,0) AS display_amount,
		       COALESCE(i.status,'pending') AS status,
		       COUNT(li.id) AS item_count
		FROM ${invoices} i
		LEFT JOIN ${suppliers} s ON s.id = i.supplier_id
		LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
		GROUP BY i.id
		ORDER BY i.created_at DESC LIMIT 6
	`);

	// ── Pending invoices ("Por revisar") ──────────────────────────────────
	type PendingRow = {
		id: number; supplier_name: string | null; invoice_number: string | null;
		invoice_date: string | null; display_amount: number; item_count: number;
	};
	const pendingInvoices = db.all<PendingRow>(sql`
		SELECT i.id, s.name AS supplier_name, i.invoice_number, i.invoice_date,
		       COALESCE(i.total_amount,0) AS display_amount,
		       COUNT(li.id) AS item_count
		FROM ${invoices} i
		LEFT JOIN ${suppliers} s ON s.id = i.supplier_id
		LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
		WHERE i.status = 'pending'
		GROUP BY i.id
		ORDER BY i.created_at DESC LIMIT 5
	`);

	// ── Missing invoices ──────────────────────────────────────────────────
	const missingInvoices = detectMissingInvoices(today);

	// ── Price shock alerts ────────────────────────────────────────────────
	const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString().split('T')[0];
	const priceShockRows = db.all<{ id: number; message: string; payload: string | null; createdAt: string | null }>(sql`
		SELECT id, message, payload, created_at AS createdAt
		FROM system_notifications
		WHERE notification_type = 'price_shock'
		  AND status = 'pending'
		  AND date(created_at) >= ${sevenDaysAgo}
		ORDER BY created_at DESC
		LIMIT 10
	`);
	const priceShockAlerts = priceShockRows.map((r) => ({
		...r,
		payload: r.payload ? JSON.parse(r.payload) : null,
	}));

	// ── Budget overage alerts ─────────────────────────────────────────────
	const budgetAlertRows = db.all<{ id: number; message: string; payload: string | null; createdAt: string | null }>(sql`
		SELECT id, message, payload, created_at AS createdAt
		FROM system_notifications
		WHERE notification_type = 'budget_overage'
		  AND status = 'pending'
		  AND date(created_at) >= ${sevenDaysAgo}
		ORDER BY created_at DESC
		LIMIT 5
	`);

	// ── Unified dashboard alerts ──────────────────────────────────────────
	type DashAlert = {
		id: string; sev: 'high' | 'med' | 'low';
		kind: 'price' | 'budget' | 'due' | 'info';
		text: string; detail: string; when: string;
		payload?: Record<string, unknown> | null;
	};

	function relativeTime(iso: string | null): string {
		if (!iso) return '';
		const diff = today.getTime() - new Date(iso).getTime();
		const h = Math.floor(diff / 3600000);
		if (h < 1)  return 'hace un momento';
		if (h < 24) return `hace ${h} h`;
		const d = Math.floor(h / 24);
		if (d === 1) return 'ayer';
		return `hace ${d} d`;
	}

	const dashboardAlerts: DashAlert[] = [
		...priceShockAlerts.map((a) => {
			const p = a.payload as { ingredient?: string; supplier?: string; oldPrice?: number; newPrice?: number; deviationPct?: number } | null;
			const pct = p?.deviationPct != null ? Math.abs(p.deviationPct) : null;
			const dir = p?.deviationPct != null && p.deviationPct > 0 ? 'subió' : 'bajó';
			return {
				id: `ps-${a.id}`,
				sev: 'high' as const,
				kind: 'price' as const,
				text: p?.ingredient
					? `${p.ingredient} ${dir} un ${pct}%`
					: a.message.replace(/^⚠️\s*/, ''),
				detail: p?.supplier ?? '',
				when: relativeTime(a.createdAt),
				payload: a.payload,
			};
		}),
		...budgetAlertRows.map((a) => {
			const p = a.payload ? JSON.parse(a.payload) as { category?: string; pct?: number; level?: string } : null;
			const isExceeded = p?.level === 'exceeded';
			return {
				id: `ba-${a.id}`,
				sev: isExceeded ? 'high' as const : 'med' as const,
				kind: 'budget' as const,
				text: p?.category
					? `${p.category} al ${p.pct}% del presupuesto mensual`
					: a.message.replace(/^[🔴🟡]\s*/, ''),
				detail: '',
				when: relativeTime(a.createdAt),
				payload: p,
			};
		}),
	].sort((a, b) => {
		const order = { high: 0, med: 1, low: 2 };
		return order[a.sev] - order[b.sev];
	}).slice(0, 6);

	const highCount = dashboardAlerts.filter(a => a.sev === 'high').length;
	const medCount  = dashboardAlerts.filter(a => a.sev === 'med').length;

	// ── Invoice aging ─────────────────────────────────────────────────────
	type AgingRow = { fresh: number; mid: number; old: number };
	const aging = db.get<AgingRow>(sql`
		SELECT
			COUNT(CASE WHEN julianday('now')-julianday(COALESCE(invoice_date,created_at)) <= 7 THEN 1 END) AS fresh,
			COUNT(CASE WHEN julianday('now')-julianday(COALESCE(invoice_date,created_at)) BETWEEN 8 AND 30 THEN 1 END) AS mid,
			COUNT(CASE WHEN julianday('now')-julianday(COALESCE(invoice_date,created_at)) > 30 THEN 1 END) AS old
		FROM ${invoices} WHERE status='pending'
	`) ?? { fresh: 0, mid: 0, old: 0 };

	const avgInvoiceRow = db.get<{ avg: number | null }>(sql`
		SELECT ROUND(AVG(total_amount),0) AS avg FROM ${invoices} WHERE total_amount IS NOT NULL
	`);
	const avgInvoice = avgInvoiceRow?.avg ?? null;

	// ── Reminders ────────────────────────────────────────────────────────
	type ReminderRow = { id: number; supplier_name: string | null; invoice_number: string | null; due_date: string; display_amount: number };
	const reminderRows = db.all<ReminderRow>(sql`
		SELECT i.id, s.name AS supplier_name, i.invoice_number,
		       i.due_date, COALESCE(i.total_amount,0) AS display_amount
		FROM ${invoices} i
		LEFT JOIN ${suppliers} s ON s.id = i.supplier_id
		WHERE i.status='pending' AND i.due_date IS NOT NULL AND i.due_date <= ${weekEnd}
		ORDER BY i.due_date ASC
	`);

	const reminders = reminderRows.map((r) => {
		const daysDelta = Math.round((new Date(r.due_date).getTime() - today.getTime()) / 86400000);
		return { ...r, days_delta: daysDelta, overdue: daysDelta < 0 };
	});

	const nowMonth = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

	return {
		title: 'Dashboard',
		subtitle: nowMonth + ' · EUR',
		firstInvoice,
		overdue,
		due_week: dueWeek,
		pending,
		paid_month: paidMonth,
		supplier_count: supplierCount,
		suppliers: supps,
		category_spend: categorySpend,
		recent_invoices: recent,
		pending_invoices: pendingInvoices,
		valid_categories: VALID_CATEGORIES,
		budgets,
		budget_threshold: threshold,
		category_spend_map: categorySpendMap,
		total_budget: totalBudget,
		total_spent: totalSpent,
		total_pct_bar: totalPctBar,
		total_pct_actual: totalPctActual,
		missing_invoices: missingInvoices,
		price_shock_alerts: priceShockAlerts,
		dashboard_alerts: dashboardAlerts,
		alert_counts: { high: highCount, med: medCount },
		reminders,
		mom: { this_month: momRow.this_month, last_month: momRow.last_month, pct_change: momPct },
		aging,
		avg_invoice: avgInvoice,
		avg_per_supplier: avgPerSupplier,
		avg_per_supplier_delta: avgPerSupplierDelta,
		spark_data: sparkData,
		projection: { daily_rate: dailyRate, projected_eom: projectedEom, elapsed_pct: projectedElapsedPct, days_elapsed: daysElapsed, days_in_month: daysInMonth },
	};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[dashboard] load failed', e);
		error(500, 'Failed to load dashboard');
	}
};

export const actions: Actions = {
	markPaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, id)).run();
		redirect(303, '/dashboard');
	},
	markUnpaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		db.update(invoices).set({ status: 'pending' }).where(eq(invoices.id, id)).run();
		redirect(303, '/dashboard');
	},
};
