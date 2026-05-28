import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { categoryBudgets, invoices, invoiceLineItems, suppliers } from '$lib/server/schema';
import { and, eq, sql } from 'drizzle-orm';
import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	try {
		const [rows, spendRows] = await Promise.all([
			db.select().from(categoryBudgets).where(eq(categoryBudgets.restaurantId, rid)),

			db.execute<{ category: string; total: number }>(sql`
				SELECT COALESCE(s.category, 'Other') AS category,
				       SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total
				FROM invoice_line_items ili
				JOIN invoices i ON i.id = ili.invoice_id
				JOIN suppliers s ON s.id = i.supplier_id
				WHERE i.restaurant_id = ${rid}
				  AND TO_CHAR(i.invoice_date::date, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')
				GROUP BY COALESCE(s.category, 'Other')
			`),
		]);

		const budgets: Record<string, number> = {};
		for (const row of rows) budgets[row.category] = row.monthlyBudget ?? 0;

		const category_spend: Record<string, number> = {};
		for (const row of spendRows) category_spend[String(row.category)] = Number(row.total);

		// Include any custom categories already stored in the DB for this restaurant
		const storedCats = rows.map(r => r.category);
		const categories = [
			...VALID_CATEGORIES,
			...storedCats.filter(c => !VALID_CATEGORIES.includes(c)),
		];

		return {
			title: 'Budgets',
			subtitle: 'Set monthly spend limits per category. Warnings appear on the dashboard.',
			categories,
			budgets,
			category_spend,
			colors: CATEGORY_COLORS,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[budgets] load failed', e);
		error(500, 'Failed to load budgets');
	}
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();

		// Categories list is passed from the form so new custom ones are included
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

		await Promise.all(categories.map(async (category) => {
			const raw = String(data.get(category) ?? '').trim();
			const amount = parseFloat(raw);
			if (!isNaN(amount) && amount >= 0) {
				await db.insert(categoryBudgets)
					.values({ restaurantId: rid, category, monthlyBudget: amount })
					.onConflictDoUpdate({
						target: [categoryBudgets.restaurantId, categoryBudgets.category],
						set: { monthlyBudget: amount },
					});
			} else {
				await db.delete(categoryBudgets)
					.where(and(eq(categoryBudgets.restaurantId, rid), eq(categoryBudgets.category, category)));
			}
		}));

		redirect(303, '/budgets');
	},
};
