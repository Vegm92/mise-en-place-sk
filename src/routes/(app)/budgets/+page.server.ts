import { fail, redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { categoryBudgets } from '$lib/server/schema';
import { and, eq, sql } from 'drizzle-orm';
import { VALID_CATEGORIES } from '$lib/constants';
import { trackEvent } from '$lib/server/events';
import { toMonthStr } from '$lib/formatters';
import { toMoneyString, moneyToNumber } from '$lib/server/money';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin } from '$lib/server/category-spend';

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	const currentMonth = toMonthStr(new Date());
	const { rangeFrom } = await parent();
	const selectedMonth = rangeFrom.slice(0, 7);

	return handleLoad('budgets', async () => {
		const [rows, spendRows] = await Promise.all([
			db.select().from(categoryBudgets)
				.where(tdb.scope(categoryBudgets.restaurantId, eq(categoryBudgets.month, selectedMonth))),

			db.execute<{ category: string; total: string }>(sql`
				SELECT ${lineCategoryExpr()} AS category,
				       SUM(${lineAmountExpr()}) AS total
				FROM invoice_line_items
				JOIN invoices i ON i.id = invoice_line_items.invoice_id
				JOIN suppliers ON suppliers.id = i.supplier_id
				${lineProductJoin()}
				WHERE i.restaurant_id = ${rid}
				  AND i.deleted_at IS NULL
				  AND ${describedLine()}
				  AND TO_CHAR(i.invoice_date, 'YYYY-MM') = ${selectedMonth}
				GROUP BY ${lineCategoryExpr()}
			`),
		]);

		const budgets: Record<string, number> = {};
		for (const row of rows) budgets[row.category] = moneyToNumber(row.monthlyBudget);

		const category_spend: Record<string, number> = {};
		for (const row of spendRows) category_spend[String(row.category)] = moneyToNumber(row.total);

		const storedCats = rows.map(r => r.category);
		const categories = [
			...VALID_CATEGORIES,
			...storedCats.filter(c => !VALID_CATEGORIES.includes(c)),
		];

		return {
			title: 'nav.budgets',
			subtitle: 'Set monthly spend limits per category. Warnings appear on the dashboard.',
			categories,
			budgets,
			category_spend,
			selectedMonth,
			currentMonth,
		};
	});
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const currentMonth = toMonthStr(new Date());
		const submittedMonth = String(data.get('_month') ?? '');
		if (submittedMonth !== currentMonth) {
			return fail(403, { error: 'Only the current month can be edited.' });
		}

		let categories: string[];
		try {
			const raw = String(data.get('_categories') ?? '');
			const parsed = JSON.parse(raw);
			categories = Array.isArray(parsed)
				? parsed
					.map((c: unknown) => String(c).trim())
					.filter(c => c.length > 0 && c.length <= 80)
				: VALID_CATEGORIES;
		} catch {
			categories = VALID_CATEGORIES;
		}

		let setCount = 0;
		await Promise.all(categories.map(async (category) => {
			const raw = String(data.get(category) ?? '').trim();
			const amount = toMoneyString(raw);
			if (amount !== null && moneyToNumber(amount) >= 0) {
				await db.insert(categoryBudgets)
					.values({ restaurantId: rid, category, month: currentMonth, monthlyBudget: amount })
					.onConflictDoUpdate({
						target: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],
						set: { monthlyBudget: amount },
					});
				setCount++;
			} else {
				await db.delete(categoryBudgets)
					.where(tdb.scope(categoryBudgets.restaurantId, and(eq(categoryBudgets.category, category), eq(categoryBudgets.month, currentMonth))));
			}
		}));

		trackEvent('budget_set', rid, { categories_with_limit: setCount });

		redirect(303, '/budgets');
	},
};
