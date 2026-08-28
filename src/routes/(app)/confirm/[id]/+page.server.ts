import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getItem } from '$lib/server/batch';

export const load: PageServerLoad = async ({ params, locals }) => {
	const item = await getItem(params.id);
	if (item && item.restaurantId === locals.restaurantId) redirect(303, `/batch/${item.batchId}`);
	redirect(303, '/');
};
