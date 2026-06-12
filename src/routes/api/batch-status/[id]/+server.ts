import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBatchItems } from '$lib/server/batch';

/**
 * Single poll endpoint for the batch page — returns every item's real status.
 * This is the only feedback channel the UI uses; there is no client-side
 * simulated progress anywhere.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const items = await getBatchItems(params.id);
	if (!items.length || items[0].restaurantId !== locals.restaurantId) {
		return json({ error: 'not found' }, { status: 404 });
	}

	return json({
		items: items.map(i => ({
			id: i.id,
			position: i.position,
			name: i.displayName,
			// `pending` reads as queued once extraction was requested; the page
			// only polls while something is in flight, so this is always right.
			status: i.status,
			error: i.extractError ?? null,
		})),
	});
};
