import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getItem } from '$lib/server/batch';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const item = await getItem(params.id);
	if (!item || item.restaurantId !== locals.restaurantId) {
		return json({ error: 'not found' }, { status: 404 });
	}

	// `pending` reads as queued: jobs are enqueued batch-wide, so pending only
	// means the queue write hasn't landed yet.
	const status = item.status === 'pending' ? 'queued' : item.status;
	return json({ status, error: item.extractError ?? null });
};
