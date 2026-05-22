import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

const THRESHOLD_KEY = 'budget_warning_threshold';

export const load: PageServerLoad = async () => {
	try {
		const row = db
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, THRESHOLD_KEY))
			.get();

		return {
			title: 'Settings',
			threshold: row ? parseInt(row.value, 10) : 80,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[settings] load failed', e);
		error(500, 'Failed to load settings');
	}
};

export const actions: Actions = {
	saveThreshold: async ({ request }) => {
		const data = await request.formData();
		const raw = Number(data.get('value'));
		const clamped = Math.max(1, Math.min(99, raw || 80));

		db.insert(settings)
			.values({ key: THRESHOLD_KEY, value: String(clamped) })
			.onConflictDoUpdate({ target: settings.key, set: { value: String(clamped) } })
			.run();

		redirect(303, '/settings');
	},
};
