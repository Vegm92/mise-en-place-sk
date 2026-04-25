import { dbClient } from './db';

export function buildChatContext(): string {
	const lines: string[] = [];

	const summary = dbClient.prepare(`
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
			COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0) AS pending_total,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date < date('now')) AS overdue_count,
			COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')), 0) AS paid_this_month
		FROM invoices
	`).get() as { pending_count: number; pending_total: number; overdue_count: number; paid_this_month: number };

	lines.push('## Invoice Summary');
	lines.push(`- Pending: ${summary.pending_count} invoices, total ${summary.pending_total.toFixed(2)}`);
	lines.push(`- Overdue: ${summary.overdue_count}`);
	lines.push(`- Paid this month: ${summary.paid_this_month.toFixed(2)}`);

	const suppliers = dbClient.prepare(`
		SELECT s.name, COALESCE(SUM(i.total_amount), 0) AS ytd_spend, COUNT(i.id) AS invoice_count
		FROM suppliers s
		LEFT JOIN invoices i ON i.supplier_id = s.id AND strftime('%Y', i.invoice_date) = strftime('%Y', 'now')
		GROUP BY s.id
		ORDER BY ytd_spend DESC
		LIMIT 5
	`).all() as Array<{ name: string; ytd_spend: number; invoice_count: number }>;

	lines.push('\n## Top Suppliers (Year to Date)');
	for (const s of suppliers) {
		lines.push(`- ${s.name}: ${s.ytd_spend.toFixed(2)} (${s.invoice_count} invoices)`);
	}

	const budgets = dbClient.prepare(`
		SELECT cb.category, cb.monthly_budget,
			COALESCE(SUM(i.total_amount), 0) AS actual_this_month
		FROM category_budgets cb
		LEFT JOIN suppliers s ON s.category = cb.category
		LEFT JOIN invoices i ON i.supplier_id = s.id
			AND strftime('%Y-%m', i.invoice_date) = strftime('%Y-%m', 'now')
		GROUP BY cb.category
	`).all() as Array<{ category: string; monthly_budget: number; actual_this_month: number }>;

	if (budgets.length) {
		lines.push('\n## Budget vs Actual (This Month)');
		for (const b of budgets) {
			const pct = b.monthly_budget > 0 ? Math.round(b.actual_this_month / b.monthly_budget * 100) : 0;
			lines.push(`- ${b.category}: ${b.actual_this_month.toFixed(2)} / ${b.monthly_budget.toFixed(2)} (${pct}%)`);
		}
	}

	const recent = dbClient.prepare(`
		SELECT s.name AS supplier, i.invoice_date, i.total_amount, i.status
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		ORDER BY i.created_at DESC
		LIMIT 10
	`).all() as Array<{ supplier: string; invoice_date: string; total_amount: number; status: string }>;

	lines.push('\n## Recent Invoices');
	for (const r of recent) {
		lines.push(`- ${r.supplier ?? 'Unknown'} | ${r.invoice_date ?? '?'} | ${r.total_amount?.toFixed(2) ?? '?'} | ${r.status}`);
	}

	const alerts = dbClient.prepare(`
		SELECT notification_type, message FROM system_notifications
		WHERE status = 'pending'
		ORDER BY created_at DESC
		LIMIT 10
	`).all() as Array<{ notification_type: string; message: string }>;

	if (alerts.length) {
		lines.push('\n## Active Alerts');
		for (const a of alerts) {
			lines.push(`- [${a.notification_type}] ${a.message}`);
		}
	}

	const stock = dbClient.prepare(`
		SELECT ingredient, current_stock, daily_burn_rate, canonical_unit
		FROM stock_levels
		ORDER BY ingredient
	`).all() as Array<{ ingredient: string; current_stock: number; daily_burn_rate: number; canonical_unit: string }>;

	if (stock.length) {
		lines.push('\n## Stock Levels');
		for (const s of stock) {
			const days = s.daily_burn_rate > 0 ? Math.round(s.current_stock / s.daily_burn_rate) : null;
			lines.push(`- ${s.ingredient}: ${s.current_stock} ${s.canonical_unit ?? ''}${days !== null ? ` (~${days} days left)` : ''}`);
		}
	}

	const trends = dbClient.prepare(`
		SELECT
			LOWER(TRIM(description)) AS item,
			MIN(unit_price) AS min_price,
			MAX(unit_price) AS max_price,
			COUNT(*) AS occurrences
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		WHERE i.invoice_date >= date('now', '-90 days')
			AND ili.unit_price IS NOT NULL AND ili.unit_price > 0
		GROUP BY LOWER(TRIM(description))
		HAVING occurrences >= 2
		ORDER BY (max_price - min_price) / min_price DESC
		LIMIT 5
	`).all() as Array<{ item: string; min_price: number; max_price: number; occurrences: number }>;

	if (trends.length) {
		lines.push('\n## Price Trends (Last 90 Days, Most Volatile)');
		for (const t of trends) {
			const pct = Math.round((t.max_price - t.min_price) / t.min_price * 100);
			lines.push(`- ${t.item}: ${t.min_price.toFixed(2)} → ${t.max_price.toFixed(2)} (+${pct}%)`);
		}
	}

	return lines.join('\n');
}
