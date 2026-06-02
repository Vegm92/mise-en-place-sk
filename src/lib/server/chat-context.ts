import { db } from './db';
import { invoices, invoiceLineItems, suppliers, categoryBudgets, stockLevels, systemNotifications } from './schema';
import { eq, sql } from 'drizzle-orm';

export async function buildChatContext(restaurantId: string): Promise<string> {
	const lines: string[] = [];

	type SummaryRow = { pending_count: number; pending_total: number; overdue_count: number; paid_this_month: number };
	const summaryRows = await db.execute<SummaryRow>(sql`
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
			COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0) AS pending_total,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE::text) AS overdue_count,
			COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND TO_CHAR(invoice_date::date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')), 0) AS paid_this_month
		FROM ${invoices}
		WHERE restaurant_id = ${restaurantId}
	`);
	const summary = (summaryRows[0] as SummaryRow | undefined) ?? { pending_count: 0, pending_total: 0, overdue_count: 0, paid_this_month: 0 };

	lines.push('## Invoice Summary');
	lines.push(`- Pending: ${summary.pending_count} invoices, total ${Number(summary.pending_total).toFixed(2)}`);
	lines.push(`- Overdue: ${summary.overdue_count}`);
	lines.push(`- Paid this month: ${Number(summary.paid_this_month).toFixed(2)}`);

	type SupplierRow = { name: string; ytd_spend: number; invoice_count: number };
	const topSuppliers = await db.execute<SupplierRow>(sql`
		SELECT s.name, COALESCE(SUM(i.total_amount), 0) AS ytd_spend, COUNT(i.id) AS invoice_count
		FROM ${suppliers} s
		LEFT JOIN ${invoices} i ON i.supplier_id = s.id
			AND TO_CHAR(i.invoice_date::date, 'YYYY') = TO_CHAR(CURRENT_DATE, 'YYYY')
		WHERE s.restaurant_id = ${restaurantId}
		GROUP BY s.id
		ORDER BY ytd_spend DESC
		LIMIT 5
	`);

	lines.push('\n## Top Suppliers (Year to Date)');
	for (const s of topSuppliers as SupplierRow[]) {
		lines.push(`- ${s.name}: ${Number(s.ytd_spend).toFixed(2)} (${s.invoice_count} invoices)`);
	}

	type BudgetRow = { category: string; monthly_budget: number; actual_this_month: number };
	const budgets = await db.execute<BudgetRow>(sql`
		SELECT cb.category, cb.monthly_budget,
			COALESCE(SUM(i.total_amount), 0) AS actual_this_month
		FROM ${categoryBudgets} cb
		LEFT JOIN ${suppliers} s ON s.category = cb.category AND s.restaurant_id = ${restaurantId}
		LEFT JOIN ${invoices} i ON i.supplier_id = s.id
			AND TO_CHAR(i.invoice_date::date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
		WHERE cb.restaurant_id = ${restaurantId}
		GROUP BY cb.category, cb.monthly_budget
	`);

	if (budgets.length) {
		lines.push('\n## Budget vs Actual (This Month)');
		for (const b of budgets as BudgetRow[]) {
			const pct = b.monthly_budget > 0 ? Math.round(b.actual_this_month / b.monthly_budget * 100) : 0;
			lines.push(`- ${b.category}: ${Number(b.actual_this_month).toFixed(2)} / ${Number(b.monthly_budget).toFixed(2)} (${pct}%)`);
		}
	}

	type RecentRow = { supplier: string; invoice_date: string; total_amount: number; status: string };
	const recent = await db.execute<RecentRow>(sql`
		SELECT s.name AS supplier, i.invoice_date, i.total_amount, i.status
		FROM ${invoices} i
		LEFT JOIN ${suppliers} s ON s.id = i.supplier_id
		WHERE i.restaurant_id = ${restaurantId}
		ORDER BY i.created_at DESC
		LIMIT 10
	`);

	lines.push('\n## Recent Invoices');
	for (const r of recent as RecentRow[]) {
		lines.push(`- ${r.supplier ?? 'Unknown'} | ${r.invoice_date ?? '?'} | ${Number(r.total_amount)?.toFixed(2) ?? '?'} | ${r.status}`);
	}

	type AlertRow = { notification_type: string; message: string };
	const alerts = await db.execute<AlertRow>(sql`
		SELECT notification_type, message FROM ${systemNotifications}
		WHERE status = 'pending' AND restaurant_id = ${restaurantId}
		ORDER BY created_at DESC
		LIMIT 10
	`);

	if (alerts.length) {
		lines.push('\n## Active Alerts');
		for (const a of alerts as AlertRow[]) {
			lines.push(`- [${a.notification_type}] ${a.message}`);
		}
	}

	type StockRow = { ingredient: string; current_stock: number; daily_burn_rate: number; canonical_unit: string | null };
	const stock = await db.select({
		ingredient:      stockLevels.ingredient,
		current_stock:   stockLevels.currentStock,
		daily_burn_rate: stockLevels.dailyBurnRate,
		canonical_unit:  stockLevels.canonicalUnit,
	}).from(stockLevels).where(eq(stockLevels.restaurantId, restaurantId)).orderBy(stockLevels.ingredient) as StockRow[];

	if (stock.length) {
		lines.push('\n## Stock Levels');
		for (const s of stock) {
			const days = s.daily_burn_rate != null && s.daily_burn_rate > 0 ? Math.round((s.current_stock ?? 0) / s.daily_burn_rate) : null;
			lines.push(`- ${s.ingredient}: ${s.current_stock} ${s.canonical_unit ?? ''}${days !== null ? ` (~${days} days left)` : ''}`);
		}
	}

	type TrendRow = { item: string; min_price: number; max_price: number; occurrences: number };
	const trends = await db.execute<TrendRow>(sql`
		SELECT
			LOWER(TRIM(ili.description)) AS item,
			MIN(ili.unit_price) AS min_price,
			MAX(ili.unit_price) AS max_price,
			COUNT(*) AS occurrences
		FROM ${invoiceLineItems} ili
		JOIN ${invoices} i ON i.id = ili.invoice_id
		WHERE i.restaurant_id = ${restaurantId}
			AND i.invoice_date >= (CURRENT_DATE - INTERVAL '90 days')::text
			AND ili.unit_price IS NOT NULL AND ili.unit_price > 0
		GROUP BY LOWER(TRIM(ili.description))
		HAVING COUNT(*) >= 2
		ORDER BY (MAX(ili.unit_price) - MIN(ili.unit_price)) / NULLIF(MIN(ili.unit_price), 0) DESC
		LIMIT 5
	`);

	if (trends.length) {
		lines.push('\n## Price Trends (Last 90 Days, Most Volatile)');
		for (const t of trends as TrendRow[]) {
			const pct = t.min_price > 0 ? Math.round((t.max_price - t.min_price) / t.min_price * 100) : 0;
			lines.push(`- ${t.item}: ${Number(t.min_price).toFixed(2)} → ${Number(t.max_price).toFixed(2)} (+${pct}%)`);
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
