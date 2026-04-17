import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dbClient } from '$lib/server/db';
import { VALID_CATEGORIES } from '$lib/constants';

export const load: PageServerLoad = async () => {
	const rows = dbClient
		.prepare('SELECT category, monthly_budget FROM category_budgets')
		.all() as { category: string; monthly_budget: number }[];

	const budgets: Record<string, number> = {};
	for (const row of rows) {
		budgets[row.category] = row.monthly_budget;
	}

	return {
		title: 'Budgets',
		subtitle: 'Set monthly spend limits per category. Warnings appear on the dashboard.',
		categories: VALID_CATEGORIES,
		budgets,
	};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const data = await request.formData();

		for (const category of VALID_CATEGORIES) {
			const raw = String(data.get(category) ?? '').trim();
			const amount = parseFloat(raw);
			if (!isNaN(amount) && amount >= 0) {
				dbClient.prepare(
					'INSERT OR REPLACE INTO category_budgets (category, monthly_budget) VALUES (?, ?)'
				).run(category, amount);
			} else {
				dbClient.prepare('DELETE FROM category_budgets WHERE category = ?').run(category);
			}
		}

		redirect(303, '/budgets');
	},
};
