import { sql, eq } from 'drizzle-orm';
import { db, forTenant } from './db';
import { categoryBudgets, settings } from './schema';
import { toMonthStr } from '$lib/formatters';
import { moneyToNumber } from './money';
import { TYPE_COLORS, categoryToType } from '$lib/constants';

export type BudgetBucket = 'Comida' | 'Bebidas' | 'Otros';
export const BUDGET_BUCKETS: BudgetBucket[] = ['Comida', 'Bebidas', 'Otros'];

export interface BudgetPill {
	bucket: BudgetBucket;
	budget: number;
	spent: number;
	pct: number | null;
	status: 'none' | 'ok' | 'near' | 'over';
	color: string;
}

/** Same 3-way split as the Bebida/Comida/Otros breakdown in Analíticas:
 * 'Otros' groups the Artículos tipo together with uncategorized spend. */
function budgetBucketOf(category: string): BudgetBucket {
	const type = categoryToType(category);
	if (type === 'Comida') return 'Comida';
	if (type === 'Bebidas') return 'Bebidas';
	return 'Otros';
}

const BUCKET_COLOR: Record<BudgetBucket, string> = {
	Comida: TYPE_COLORS['Comida'],
	Bebidas: TYPE_COLORS['Bebidas'],
	Otros: TYPE_COLORS['Artículos'],
};

/** Current month's budget-vs-spend for Comida/Bebidas/Otros, shown as the
 * budget pills on Productos and the "Alcance de presupuesto" card on
 * Analíticas — kept in one place so both stay in sync. */
export async function getBudgetPills(rid: string): Promise<BudgetPill[]> {
	const tdb = forTenant(rid);
	const currentMonth = toMonthStr(new Date());

	const [budgetRows, monthSpendRows, thresholdRows] = await Promise.all([
		db.select({ category: categoryBudgets.category, monthlyBudget: categoryBudgets.monthlyBudget })
			.from(categoryBudgets)
			.where(tdb.scope(categoryBudgets.restaurantId, eq(categoryBudgets.month, currentMonth))),
		db.execute<{ category: string; total: string }>(sql`
			SELECT COALESCE(p.category, 'Other') AS category,
			       SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total
			FROM invoice_line_items ili
			JOIN invoices i ON i.id = ili.invoice_id
			LEFT JOIN products p ON p.id = ili.product_id
			WHERE i.restaurant_id = ${rid}
			  AND TO_CHAR(i.invoice_date, 'YYYY-MM') = ${currentMonth}
			GROUP BY COALESCE(p.category, 'Other')
		`),
		db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'budget_warning_threshold')))
			.limit(1),
	]);

	const budgetByBucket: Record<BudgetBucket, number> = { Comida: 0, Bebidas: 0, Otros: 0 };
	for (const row of budgetRows) budgetByBucket[budgetBucketOf(row.category)] += moneyToNumber(row.monthlyBudget);

	const spendByBucket: Record<BudgetBucket, number> = { Comida: 0, Bebidas: 0, Otros: 0 };
	for (const row of monthSpendRows) spendByBucket[budgetBucketOf(row.category)] += moneyToNumber(row.total);

	const thresholdPct = thresholdRows[0] ? parseInt(thresholdRows[0].value, 10) : 80;

	return BUDGET_BUCKETS.map((bucket) => {
		const budget = budgetByBucket[bucket];
		const spent = spendByBucket[bucket];
		const pct = budget > 0 ? Math.round((spent / budget) * 100) : null;
		const status: BudgetPill['status'] =
			pct === null ? 'none' : pct >= 100 ? 'over' : pct >= thresholdPct ? 'near' : 'ok';
		return { bucket, budget, spent, pct, status, color: BUCKET_COLOR[bucket] };
	});
}
