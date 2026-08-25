import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireFeature } from '$lib/server/billing';

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');
	await requireFeature('weeklyDigest', locals);

	return { title: 'rep.title' };
};
