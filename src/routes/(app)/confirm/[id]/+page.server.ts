import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getItem } from '$lib/server/batch';

// Legacy route — superseded by /batch/[batchId]. Old links carry an item id;
// resolve it to the batch when possible, otherwise go home.
export const load: PageServerLoad = async ({ params }) => {
	const item = await getItem(params.id);
	if (item) redirect(303, `/batch/${item.batchId}`);
	redirect(303, '/');
};
