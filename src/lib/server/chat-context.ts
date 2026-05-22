import { db } from './db';
import { invoices, invoiceLineItems, suppliers, categoryBudgets, stockLevels, systemNotifications } from './schema';
import { sql } from 'drizzle-orm';

export function buildChatContext(): string {
	const lines: string[] = [];

	type SummaryRow = { pending_count: number; pending_total: number; overdue_count: number; paid_this_month: number };
	const summary = db.get<SummaryRow>(sql`
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
			COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0) AS pending_total,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date < date('now')) AS overdue_count,
			COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')), 0) AS paid_this_month
		FROM ${invoices}
	`) ?? { pending_count: 0, pending_total: 0, overdue_count: 0, paid_this_month: 0 };

	lines.push('## Invoice Summary');
	lines.push(`- Pending: ${summary.pending_count} invoices, total ${summary.pending_total.toFixed(2)}`);
	lines.push(`- Overdue: ${summary.overdue_count}`);
	lines.push(`- Paid this month: ${summary.paid_this_month.toFixed(2)}`);

	type SupplierRow = { name: string; ytd_spend: number; invoice_count: number };
	const topSuppliers = db.all<SupplierRow>(sql`
		SELECT s.name, COALESCE(SUM(i.total_amount), 0) AS ytd_spend, COUNT(i.id) AS invoice_count
		FROM ${suppliers} s
		LEFT JOIN ${invoices} i ON i.supplier_id = s.id AND strftime('%Y', i.invoice_date) = strftime('%Y', 'now')
		GROUP BY s.id
		ORDER BY ytd_spend DESC
		LIMIT 5
	`);

	lines.push('\n## Top Suppliers (Year to Date)');
	for (const s of topSuppliers) {
		lines.push(`- ${s.name}: ${s.ytd_spend.toFixed(2)} (${s.invoice_count} invoices)`);
	}

	type BudgetRow = { category: string; monthly_budget: number; actual_this_month: number };
	const budgets = db.all<BudgetRow>(sql`
		SELECT cb.category, cb.monthly_budget,
			COALESCE(SUM(i.total_amount), 0) AS actual_this_month
		FROM ${categoryBudgets} cb
		LEFT JOIN ${suppliers} s ON s.category = cb.category
		LEFT JOIN ${invoices} i ON i.supplier_id = s.id
			AND strftime('%Y-%m', i.invoice_date) = strftime('%Y-%m', 'now')
		GROUP BY cb.category
	`);

	if (budgets.length) {
		lines.push('\n## Budget vs Actual (This Month)');
		for (const b of budgets) {
			const pct = b.monthly_budget > 0 ? Math.round(b.actual_this_month / b.monthly_budget * 100) : 0;
			lines.push(`- ${b.category}: ${b.actual_this_month.toFixed(2)} / ${b.monthly_budget.toFixed(2)} (${pct}%)`);
		}
	}

	type RecentRow = { supplier: string; invoice_date: string; total_amount: number; status: string };
	const recent = db.all<RecentRow>(sql`
		SELECT s.name AS supplier, i.invoice_date, i.total_amount, i.status
		FROM ${invoices} i
		LEFT JOIN ${suppliers} s ON s.id = i.supplier_id
		ORDER BY i.created_at DESC
		LIMIT 10
	`);

	lines.push('\n## Recent Invoices');
	for (const r of recent) {
		lines.push(`- ${r.supplier ?? 'Unknown'} | ${r.invoice_date ?? '?'} | ${r.total_amount?.toFixed(2) ?? '?'} | ${r.status}`);
	}

	type AlertRow = { notification_type: string; message: string };
	const alerts = db.all<AlertRow>(sql`
		SELECT notification_type, message FROM ${systemNotifications}
		WHERE status = 'pending'
		ORDER BY created_at DESC
		LIMIT 10
	`);

	if (alerts.length) {
		lines.push('\n## Active Alerts');
		for (const a of alerts) {
			lines.push(`- [${a.notification_type}] ${a.message}`);
		}
	}

	type StockRow = { ingredient: string; current_stock: number; daily_burn_rate: number; canonical_unit: string | null };
	const stock = db.select({
		ingredient:      stockLevels.ingredient,
		current_stock:   stockLevels.currentStock,
		daily_burn_rate: stockLevels.dailyBurnRate,
		canonical_unit:  stockLevels.canonicalUnit,
	}).from(stockLevels).orderBy(stockLevels.ingredient).all() as StockRow[];

	if (stock.length) {
		lines.push('\n## Stock Levels');
		for (const s of stock) {
			const days = s.daily_burn_rate > 0 ? Math.round(s.current_stock / s.daily_burn_rate) : null;
			lines.push(`- ${s.ingredient}: ${s.current_stock} ${s.canonical_unit ?? ''}${days !== null ? ` (~${days} days left)` : ''}`);
		}
	}

	type TrendRow = { item: string; min_price: number; max_price: number; occurrences: number };
	const trends = db.all<TrendRow>(sql`
		SELECT
			LOWER(TRIM(ili.description)) AS item,
			MIN(ili.unit_price) AS min_price,
			MAX(ili.unit_price) AS max_price,
			COUNT(*) AS occurrences
		FROM ${invoiceLineItems} ili
		JOIN ${invoices} i ON i.id = ili.invoice_id
		WHERE i.invoice_date >= date('now', '-90 days')
			AND ili.unit_price IS NOT NULL AND ili.unit_price > 0
		GROUP BY LOWER(TRIM(ili.description))
		HAVING occurrences >= 2
		ORDER BY (max_price - min_price) / min_price DESC
		LIMIT 5
	`);

	if (trends.length) {
		lines.push('\n## Price Trends (Last 90 Days, Most Volatile)');
		for (const t of trends) {
			const pct = Math.round((t.max_price - t.min_price) / t.min_price * 100);
			lines.push(`- ${t.item}: ${t.min_price.toFixed(2)} → ${t.max_price.toFixed(2)} (+${pct}%)`);
		}
	}

	const context = lines.join('\n');

	const TOKEN_LIMIT = 20_000;
	const estimatedTokens = Math.ceil(context.length / 4);
	if (estimatedTokens > TOKEN_LIMIT) {
		console.warn(`[chat-context] estimated ${estimatedTokens} tokens — truncating to ~${TOKEN_LIMIT}`);
		return context.slice(0, TOKEN_LIMIT * 4);
	}

	return context;
}
