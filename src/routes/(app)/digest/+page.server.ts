import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getOrGenerateWeeklyDigest, dismissWeeklyDigest, isoWeek } from '$lib/server/weekly-digest';
import { trackEvent } from '$lib/server/events';

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');

	const currentWeek = isoWeek(new Date());
	const weeklyDigest = await getOrGenerateWeeklyDigest(rid, currentWeek);
	trackEvent('digest_viewed', rid, { week: currentWeek });

	return {
		title: 'nav.digest',
		weekly_digest: weeklyDigest,
		current_week: currentWeek,
	};
};

export const actions: Actions = {
	dismissDigest: async ({ locals }) => {
		await dismissWeeklyDigest(locals.restaurantId!);
		redirect(303, '/digest');
	},
};
