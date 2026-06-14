import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { settings } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

const THRESHOLD_KEY   = 'budget_warning_threshold';
const PRICE_ALERT_KEY = 'price_alert_threshold';

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	try {
		const [row, priceRow] = await Promise.all([
			db.select({ value: settings.value })
				.from(settings)
				.where(tdb.scope(settings.restaurantId, eq(settings.key, THRESHOLD_KEY))),
			db.select({ value: settings.value })
				.from(settings)
				.where(tdb.scope(settings.restaurantId, eq(settings.key, PRICE_ALERT_KEY))),
		]);

		return {
			title: 'Settings',
			threshold:      row[0]      ? parseInt(row[0].value, 10)          : 80,
			priceThreshold: priceRow[0] ? Math.round(parseFloat(priceRow[0].value) * 100) : 15,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[settings] load failed', e);
		error(500, 'Failed to load settings');
	}
};

export const actions: Actions = {
	saveThreshold: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const clamped = String(Math.max(1, Math.min(99, Number(data.get('value')) || 80)));

		await db.insert(settings)
			.values({ restaurantId: rid, key: THRESHOLD_KEY, value: clamped })
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: clamped },
			});

		redirect(303, '/settings');
	},
	savePriceThreshold: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const stored = (Math.max(1, Math.min(99, Number(data.get('value')) || 15)) / 100).toFixed(2);

		await db.insert(settings)
			.values({ restaurantId: rid, key: PRICE_ALERT_KEY, value: stored })
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: stored },
			});

		redirect(303, '/settings');
	},
	resetTutorial: async ({ locals }) => {
		const rid = locals.restaurantId!;
		await db.insert(settings)
			.values({ restaurantId: rid, key: 'tutorial_step', value: '1' })
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: '1' },
			});
		redirect(303, '/');
	},
};
