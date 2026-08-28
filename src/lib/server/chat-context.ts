import { db, forTenant } from './db';
import { invoices, invoiceLineItems, suppliers, categoryBudgets, stockLevels, systemNotifications } from './schema';
import { sql } from 'drizzle-orm';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin } from './category-spend';

const TOKEN_LIMIT = 20_000;

type SummaryRow = { pending_count: number; pending_total: number; overdue_count: number; paid_this_month: number };
type SupplierRow = { name: string; ytd_spend: number; invoice_count: number };
type BudgetRow = { category: string; monthly_budget: number; actual_this_month: number };
type RecentRow = { supplier: string; invoice_date: string; total_amount: number; status: string };
type AlertRow = { notification_type: string; message: string };
type StockRow = { ingredient: string; current_stock: number; daily_burn_rate: number; canonical_unit: string | null };
type TrendRow = { item: string; min_price: number; max_price: number; occurrences: number };

export async function buildChatContext(restaurantId: string): Promise<string> {
	const tdb = forTenant(restaurantId);
	const sections = await Promise.all([
		summarySection(restaurantId),
		suppliersSection(restaurantId),
		budgetsSection(restaurantId),
		recentSection(restaurantId),
		alertsSection(restaurantId),
		stockSection(tdb, restaurantId),
		trendsSection(restaurantId),
	]);

	return truncate(sections.filter(Boolean).join('\n'));
}

function truncate(context: string): string {
	const estimatedTokens = Math.ceil(context.length / 4);
	if (estimatedTokens <= TOKEN_LIMIT) return context;

	console.warn(`[chat-context] estimated ${estimatedTokens} tokens — truncating to ~${TOKEN_LIMIT}`);
	return context.slice(0, TOKEN_LIMIT * 4);
}

async function summarySection(restaurantId: string): Promise<string> {
	const summaryRows = await db.execute<SummaryRow>(sql`
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
			COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending'), 0)::float8 AS pending_total,
			COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE) AS overdue_count,
			COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND TO_CHAR(invoice_date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')), 0)::float8 AS paid_this_month
		FROM ${invoices}
		WHERE restaurant_id = ${restaurantId}
	`);
	const summary = (summaryRows[0] as SummaryRow | undefined) ?? { pending_count: 0, pending_total: 0, overdue_count: 0, paid_this_month: 0 };

	const lines = [
		'## Invoice Summary',
		`- Pending: ${summary.pending_count} invoices, total ${Number(summary.pending_total).toFixed(2)}`,
		`- Overdue: ${summary.overdue_count}`,
		`- Paid this month: ${Number(summary.paid_this_month).toFixed(2)}`,
	];
	return lines.join('\n');
}

async function suppliersSection(restaurantId: string): Promise<string> {
	const topSuppliers = await db.execute<SupplierRow>(sql`
		SELECT s.name, COALESCE(SUM(i.total_amount), 0)::float8 AS ytd_spend, COUNT(i.id) AS invoice_count
		FROM ${suppliers} s
		LEFT JOIN ${invoices} i ON i.supplier_id = s.id
			AND TO_CHAR(i.invoice_date, 'YYYY') = TO_CHAR(CURRENT_DATE, 'YYYY')
		WHERE s.restaurant_id = ${restaurantId}
		GROUP BY s.id
		ORDER BY ytd_spend DESC
		LIMIT 5
	`);

	const lines = (topSuppliers as SupplierRow[]).map((s) =>
		`- ${s.name}: ${Number(s.ytd_spend).toFixed(2)} (${s.invoice_count} invoices)`,
	);
	return ['\n## Top Suppliers (Year to Date)', ...lines].join('\n');
}

async function budgetsSection(restaurantId: string): Promise<string> {
	const budgets = await db.execute<BudgetRow>(sql`
		WITH month_spend AS (
			SELECT ${lineCategoryExpr()} AS category,
			       SUM(${lineAmountExpr()}) AS spend
			FROM invoice_line_items
			JOIN invoices i ON i.id = invoice_line_items.invoice_id
			JOIN suppliers ON suppliers.id = i.supplier_id
			${lineProductJoin()}
			WHERE i.restaurant_id = ${restaurantId}
			  AND i.deleted_at IS NULL
			  AND ${describedLine()}
			  AND TO_CHAR(i.invoice_date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
			GROUP BY ${lineCategoryExpr()}
		)
		SELECT cb.category, cb.monthly_budget::float8 AS monthly_budget,
			COALESCE(ms.spend, 0)::float8 AS actual_this_month
		FROM ${categoryBudgets} cb
		LEFT JOIN month_spend ms ON ms.category = cb.category
		WHERE cb.restaurant_id = ${restaurantId}
		  AND cb.month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
	`);

	if (!budgets.length) return '';

	const lines = (budgets as BudgetRow[]).map((b) => {
		const pct = budgetPercent(b.monthly_budget, b.actual_this_month);
		return `- ${b.category}: ${Number(b.actual_this_month).toFixed(2)} / ${Number(b.monthly_budget).toFixed(2)} (${pct}%)`;
	});
	return ['\n## Budget vs Actual (This Month)', ...lines].join('\n');
}

function budgetPercent(budget: number, actual: number): number {
	return budget > 0 ? Math.round(actual / budget * 100) : 0;
}

async function recentSection(restaurantId: string): Promise<string> {
	const recent = await db.execute<RecentRow>(sql`
		SELECT s.name AS supplier, i.invoice_date, i.total_amount::float8 AS total_amount, i.status
		FROM ${invoices} i
		LEFT JOIN ${suppliers} s ON s.id = i.supplier_id
		WHERE i.restaurant_id = ${restaurantId}
		ORDER BY i.created_at DESC
		LIMIT 10
	`);

	const lines = (recent as RecentRow[]).map((r) =>
		`- ${r.supplier ?? 'Unknown'} | ${r.invoice_date ?? '?'} | ${Number(r.total_amount)?.toFixed(2) ?? '?'} | ${r.status}`,
	);
	return ['\n## Recent Invoices', ...lines].join('\n');
}

async function alertsSection(restaurantId: string): Promise<string> {
	const alerts = await db.execute<AlertRow>(sql`
		SELECT notification_type, message FROM ${systemNotifications}
		WHERE status = 'pending' AND restaurant_id = ${restaurantId}
		ORDER BY created_at DESC
		LIMIT 10
	`);

	if (!alerts.length) return '';

	const lines = (alerts as AlertRow[]).map((a) => `- [${a.notification_type}] ${a.message}`);
	return ['\n## Active Alerts', ...lines].join('\n');
}

async function stockSection(tdb: ReturnType<typeof forTenant>, restaurantId: string): Promise<string> {
	const stock = await db.select({
		ingredient:      stockLevels.ingredient,
		current_stock:   stockLevels.currentStock,
		daily_burn_rate: stockLevels.dailyBurnRate,
		canonical_unit:  stockLevels.canonicalUnit,
	}).from(stockLevels).where(tdb.scope(stockLevels.restaurantId)).orderBy(stockLevels.ingredient) as StockRow[];

	if (!stock.length) return '';

	const lines = stock.map((s) => {
		const days = daysLeft(s.current_stock, s.daily_burn_rate);
		const daysSuffix = days !== null ? ` (~${days} days left)` : '';
		return `- ${s.ingredient}: ${s.current_stock} ${s.canonical_unit ?? ''}${daysSuffix}`;
	});
	return ['\n## Stock Levels', ...lines].join('\n');
}

function daysLeft(currentStock: number, dailyBurnRate: number): number | null {
	return dailyBurnRate != null && dailyBurnRate > 0 ? Math.round((currentStock ?? 0) / dailyBurnRate) : null;
}

async function trendsSection(restaurantId: string): Promise<string> {
	const trends = await db.execute<TrendRow>(sql`
		SELECT
			mep_norm_key(ili.description) AS item,
			MIN(ili.unit_price)::float8 AS min_price,
			MAX(ili.unit_price)::float8 AS max_price,
			COUNT(*) AS occurrences
		FROM ${invoiceLineItems} ili
		JOIN ${invoices} i ON i.id = ili.invoice_id
		WHERE i.restaurant_id = ${restaurantId}
			AND i.invoice_date >= (CURRENT_DATE - INTERVAL '90 days')
			AND ili.unit_price IS NOT NULL AND ili.unit_price > 0
		GROUP BY mep_norm_key(ili.description)
		HAVING COUNT(*) >= 2
		ORDER BY (MAX(ili.unit_price) - MIN(ili.unit_price)) / NULLIF(MIN(ili.unit_price), 0) DESC
		LIMIT 5
	`);

	if (!trends.length) return '';

	const lines = (trends as TrendRow[]).map((t) => {
		const pct = trendPercent(t.min_price, t.max_price);
		return `- ${t.item}: ${Number(t.min_price).toFixed(2)} → ${Number(t.max_price).toFixed(2)} (+${pct}%)`;
	});
	return ['\n## Price Trends (Last 90 Days, Most Volatile)', ...lines].join('\n');
}

function trendPercent(minPrice: number, maxPrice: number): number {
	return minPrice > 0 ? Math.round((maxPrice - minPrice) / minPrice * 100) : 0;
}