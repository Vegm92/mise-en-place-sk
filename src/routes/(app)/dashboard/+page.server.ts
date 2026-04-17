import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dbClient } from '$lib/server/db';
import { CATEGORY_COLORS, VALID_CATEGORIES } from '$lib/constants';

function detectMissingInvoices(today: Date): {
	supplier_name: string;
	last_invoice: string;
	expected_by: string;
	days_late: number;
	frequency: string;
}[] {
	const rows = dbClient.prepare(`
		SELECT s.name AS supplier_name, i.invoice_date
		FROM invoices i
		JOIN suppliers s ON s.id = i.supplier_id
		WHERE i.invoice_date IS NOT NULL
		ORDER BY s.id, i.invoice_date ASC
	`).all() as { supplier_name: string; invoice_date: string }[];

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
			Math.round((d.getTime() - dateObjs[i].getTime()) / 86400000)
		);
		const sorted = [...gaps].sort((a, b) => a - b);
		const n = sorted.length;
		const medianGap = n % 2 === 0
			? ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2
			: sorted[Math.floor(n / 2)] ?? 0;

		if (medianGap < 3) continue;

		const last = dateObjs[dateObjs.length - 1];
		if (!last) continue;
		const daysSinceLast = Math.round((today.getTime() - last.getTime()) / 86400000);
		if (daysSinceLast <= 1.5 * medianGap) continue;

		const expectedBy = new Date(last.getTime() + medianGap * 86400000);
		const daysLate = Math.round((today.getTime() - expectedBy.getTime()) / 86400000);

		let frequency = 'periodic';
		if (medianGap <= 10) frequency = 'weekly';
		else if (medianGap <= 20) frequency = 'biweekly';
		else if (medianGap <= 45) frequency = 'monthly';

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

export const load: PageServerLoad = async () => {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayIso = today.toISOString().split('T')[0];
	const weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];

	const overdue = dbClient.prepare(
		"SELECT COUNT(*) AS count FROM invoices WHERE status='pending' AND due_date IS NOT NULL AND due_date < ?"
	).get(todayIso) as { count: number };

	const dueWeek = dbClient.prepare(
		"SELECT COUNT(*) AS count, COALESCE(SUM(COALESCE(total_amount,0)),0) AS amount FROM invoices WHERE status='pending' AND due_date IS NOT NULL AND due_date BETWEEN ? AND ?"
	).get(todayIso, weekEnd) as { count: number; amount: number };

	const pending = dbClient.prepare(
		"SELECT COALESCE(SUM(COALESCE(total_amount,0)),0) AS amount, COUNT(*) AS count FROM invoices WHERE status='pending'"
	).get() as { amount: number; count: number };

	const paidMonth = dbClient.prepare(
		"SELECT COALESCE(SUM(COALESCE(total_amount,0)),0) AS amount, COUNT(*) AS count FROM invoices WHERE status='paid' AND strftime('%Y-%m',invoice_date)=strftime('%Y-%m','now')"
	).get() as { amount: number; count: number };

	const supplierCount = (dbClient.prepare('SELECT COUNT(*) AS cnt FROM suppliers').get() as { cnt: number }).cnt;

	const supplierRows = dbClient.prepare(`
		SELECT
			s.id, s.name,
			COALESCE(s.category,'Other') AS category,
			COALESCE(SUM(CASE WHEN strftime('%Y-%m',i.invoice_date)=strftime('%Y-%m','now') THEN COALESCE(i.total_amount,0) ELSE 0 END),0) AS month_spend,
			COUNT(CASE WHEN i.status='pending' THEN 1 END) AS open_count,
			MAX(CASE WHEN i.status='pending' AND i.due_date IS NOT NULL AND i.due_date < ? THEN 1 ELSE 0 END) AS has_overdue,
			MAX(CASE WHEN i.status='pending' AND i.due_date IS NOT NULL AND i.due_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS has_due_soon
		FROM suppliers s
		LEFT JOIN invoices i ON i.supplier_id = s.id
		GROUP BY s.id
		ORDER BY month_spend DESC
		LIMIT 6
	`).all(todayIso, todayIso, weekEnd) as {
		id: number; name: string; category: string;
		month_spend: number; open_count: number;
		has_overdue: number; has_due_soon: number;
	}[];

	const suppliers = supplierRows.map((r) => ({
		...r,
		badge: r.has_overdue ? 'overdue' : r.has_due_soon ? 'due_soon' : 'paid_up',
		color: CATEGORY_COLORS[r.category] ?? CATEGORY_COLORS['Other'],
	}));

	const catRows = dbClient.prepare(`
		SELECT COALESCE(s.category,'Other') AS category,
		       COALESCE(SUM(COALESCE(i.total_amount,0)),0) AS total
		FROM invoices i
		JOIN suppliers s ON i.supplier_id = s.id
		WHERE strftime('%Y-%m',i.invoice_date)=strftime('%Y-%m','now')
		GROUP BY COALESCE(s.category,'Other')
		ORDER BY total DESC
	`).all() as { category: string; total: number }[];

	const maxCat = Math.max(...catRows.map((c) => c.total), 1);
	const categorySpend = catRows.map((cat) => ({
		...cat,
		pct: Math.round(cat.total / maxCat * 100),
		color: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS['Other'],
	}));

	const categorySpendMap: Record<string, number> = {};
	for (const cat of categorySpend) categorySpendMap[cat.category] = cat.total;

	const budgetRows = dbClient.prepare('SELECT category, monthly_budget FROM category_budgets').all() as { category: string; monthly_budget: number }[];
	const budgets: Record<string, number> = {};
	for (const row of budgetRows) budgets[row.category] = row.monthly_budget;

	const thresholdRow = dbClient.prepare("SELECT value FROM settings WHERE key='budget_warning_threshold'").get() as { value: string } | undefined;
	const threshold = thresholdRow ? parseInt(thresholdRow.value, 10) : 80;

	const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);
	const totalSpent = Object.keys(budgets).reduce((sum, cat) => sum + (categorySpendMap[cat] ?? 0), 0);
	const totalPctActual = totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100 * 10) / 10 : 0;
	const totalPctBar = Math.min(totalPctActual, 100);

	const recent = dbClient.prepare(`
		SELECT i.id, s.name AS supplier_name, i.invoice_date,
		       COALESCE(i.total_amount,0) AS display_amount, i.status
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		ORDER BY i.created_at DESC LIMIT 5
	`).all() as { id: number; supplier_name: string | null; invoice_date: string | null; display_amount: number; status: string }[];

	const missingInvoices = detectMissingInvoices(today);

	// Month-over-month spend
	const momRow = dbClient.prepare(`
		SELECT
			COALESCE(SUM(CASE WHEN strftime('%Y-%m',invoice_date)=strftime('%Y-%m','now') THEN COALESCE(total_amount,0) END),0) AS this_month,
			COALESCE(SUM(CASE WHEN strftime('%Y-%m',invoice_date)=strftime('%Y-%m',date('now','-1 month')) THEN COALESCE(total_amount,0) END),0) AS last_month
		FROM invoices WHERE invoice_date >= date('now','-2 months')
	`).get() as { this_month: number; last_month: number };
	const momPct = momRow.last_month > 0
		? Math.round((momRow.this_month - momRow.last_month) / momRow.last_month * 100)
		: null;

	// Pending invoice aging buckets
	const aging = dbClient.prepare(`
		SELECT
			COUNT(CASE WHEN julianday('now')-julianday(COALESCE(invoice_date,created_at)) <= 7 THEN 1 END) AS fresh,
			COUNT(CASE WHEN julianday('now')-julianday(COALESCE(invoice_date,created_at)) BETWEEN 8 AND 30 THEN 1 END) AS mid,
			COUNT(CASE WHEN julianday('now')-julianday(COALESCE(invoice_date,created_at)) > 30 THEN 1 END) AS old
		FROM invoices WHERE status='pending'
	`).get() as { fresh: number; mid: number; old: number };

	// Average invoice value
	const avgInvoice = (dbClient.prepare(
		'SELECT ROUND(AVG(total_amount),0) AS avg FROM invoices WHERE total_amount IS NOT NULL'
	).get() as { avg: number | null }).avg;

	const reminderRows = dbClient.prepare(`
		SELECT i.id, s.name AS supplier_name, i.invoice_number,
		       i.due_date, COALESCE(i.total_amount,0) AS display_amount
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		WHERE i.status='pending' AND i.due_date IS NOT NULL AND i.due_date <= ?
		ORDER BY i.due_date ASC
	`).all(weekEnd) as { id: number; supplier_name: string | null; invoice_number: string | null; due_date: string; display_amount: number }[];

	const reminders = reminderRows.map((r) => {
		const daysDelta = Math.round((new Date(r.due_date).getTime() - today.getTime()) / 86400000);
		return { ...r, days_delta: daysDelta, overdue: daysDelta < 0 };
	});

	const nowMonth = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

	return {
		title: 'Dashboard',
		subtitle: nowMonth + ' · EUR',
		overdue,
		due_week: dueWeek,
		pending,
		paid_month: paidMonth,
		supplier_count: supplierCount,
		suppliers,
		category_spend: categorySpend,
		recent_invoices: recent,
		valid_categories: VALID_CATEGORIES,
		budgets,
		budget_threshold: threshold,
		category_spend_map: categorySpendMap,
		total_budget: totalBudget,
		total_spent: totalSpent,
		total_pct_bar: totalPctBar,
		total_pct_actual: totalPctActual,
		missing_invoices: missingInvoices,
		reminders,
		mom: { this_month: momRow.this_month, last_month: momRow.last_month, pct_change: momPct },
		aging,
		avg_invoice: avgInvoice,
	};
};

export const actions: Actions = {
	markPaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		dbClient.prepare("UPDATE invoices SET status='paid' WHERE id=?").run(id);
		redirect(303, '/dashboard');
	},
	markUnpaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('invoiceId'));
		dbClient.prepare("UPDATE invoices SET status='pending' WHERE id=?").run(id);
		redirect(303, '/dashboard');
	},
};
