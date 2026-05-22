import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { categoryBudgets } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { VALID_CATEGORIES } from '$lib/constants';

export const load: PageServerLoad = async () => {
	try {
		const rows = db.select().from(categoryBudgets).all();

		const budgets: Record<string, number> = {};
		for (const row of rows) {
			budgets[row.category] = row.monthlyBudget;
		}

		return {
			title: 'Budgets',
			subtitle: 'Set monthly spend limits per category. Warnings appear on the dashboard.',
			categories: VALID_CATEGORIES,
			budgets,
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
