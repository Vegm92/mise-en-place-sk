import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getOrGenerateWeeklyDigest, dismissWeeklyDigest, isoWeek } from '$lib/server/weekly-digest';
import { trackEvent } from '$lib/server/events';
import { getAccessState, getTierFeatures } from '$lib/server/billing';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');

	const { features } = await parent();
	if (!features.weeklyDigest) redirect(303, '/billing?upgrade=digest');

	const access = await getAccessState(rid);
	if (!access.allowed) {
		redirect(303, `/billing?upgrade=${access.trialExpired ? 'trial' : 'inactive'}`);
	}

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
		const rid = locals.restaurantId!;
		const { weeklyDigest } = await getTierFeatures(rid);
		if (!weeklyDigest) redirect(303, '/billing?upgrade=digest');
		await dismissWeeklyDigest(rid);
		redirect(303, '/digest');
	},
};
