import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getItem } from '$lib/server/batch';

export const load: PageServerLoad = async ({ params }) => {
	const item = await getItem(params.id);
	if (item) redirect(303, `/batch/${item.batchId}`);
	redirect(303, '/');
};
