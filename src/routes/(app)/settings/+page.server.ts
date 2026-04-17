import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dbClient } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const row = dbClient
		.prepare("SELECT value FROM settings WHERE key = 'budget_warning_threshold'")
		.get() as { value: string } | undefined;

	return {
		title: 'Settings',
		threshold: row ? parseInt(row.value, 10) : 80,
	};
};

export const actions: Actions = {
	saveThreshold: async ({ request }) => {
		const data = await request.formData();
		const raw = Number(data.get('value'));
		const clamped = Math.max(1, Math.min(99, raw || 80));
		dbClient.prepare(
			"INSERT OR REPLACE INTO settings (key, value) VALUES ('budget_warning_threshold', ?)"
		).run(String(clamped));
		redirect(303, '/settings');
	},
};
