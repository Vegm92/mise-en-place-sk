import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBatchItems, failStalledItems, pickStalledItem, stallLevel } from '$lib/server/batch';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let items = await getBatchItems(params.id);
	if (!items.length || items[0].restaurantId !== locals.restaurantId) {
		return json({ error: 'not found' }, { status: 404 });
	}

	if (items.some(i => stallLevel(i) === 'expired') && await failStalledItems(params.id)) {
		items = await getBatchItems(params.id);
	}

	const open = items.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');

	return json({
		items: items.map(i => ({
			id: i.id,
			position: i.position,
			name: i.displayName,
			status: i.status,
			error: i.extractError ?? null,
			stalled: stallLevel(i) !== 'none',
		})),
		stalled: pickStalledItem(open) !== null,
	});
};
