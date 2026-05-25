import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { categoryBudgets, invoices, invoiceLineItems, suppliers } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';
import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';

export const load: PageServerLoad = async () => {
	try {
		const rows = db.select().from(categoryBudgets).all();

		const budgets: Record<string, number> = {};
		for (const row of rows) {
			budgets[row.category] = row.monthlyBudget;
		}

		type SpendRow = { category: string; total: number };
		const spendRows = db.all<SpendRow>(sql`
			SELECT COALESCE(s.category, 'Other') AS category,
			       SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total
			FROM ${invoiceLineItems} ili
			JOIN ${invoices} i ON i.id = ili.invoice_id
			JOIN ${suppliers} s ON s.id = i.supplier_id
			WHERE strftime('%Y-%m', i.invoice_date) = strftime('%Y-%m', 'now')
			GROUP BY COALESCE(s.category, 'Other')
		`);

		const category_spend: Record<string, number> = {};
		for (const row of spendRows) {
			category_spend[row.category] = row.total;
		}

		return {
			title: 'Budgets',
			subtitle: 'Set monthly spend limits per category. Warnings appear on the dashboard.',
			categories: VALID_CATEGORIES,
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
	save: async ({ request }) => {
		const data = await request.formData();

		for (const category of VALID_CATEGORIES) {
			const raw = String(data.get(category) ?? '').trim();
			const amount = parseFloat(raw);
			if (!isNaN(amount) && amount >= 0) {
				db.insert(categoryBudgets)
					.values({ category, monthlyBudget: amount })
					.onConflictDoUpdate({ target: categoryBudgets.category, set: { monthlyBudget: amount } })
					.run();
			} else {
				db.delete(categoryBudgets).where(eq(categoryBudgets.category, category)).run();
			}
		}

		redirect(303, '/budgets');
	},
};
