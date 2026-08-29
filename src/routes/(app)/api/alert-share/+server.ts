import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateCurrentWeekShare } from '$lib/server/digest-share';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';

export const POST: RequestHandler = async ({ locals }) => {
	const rid = locals.restaurantId;
	if (!rid) throw error(401, 'Unauthorized');

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'alert-share-create', max: 20 }, { restaurantId: rid }))) {
		throw error(429, 'Too many requests');
	}

	const { token } = await getOrCreateCurrentWeekShare(rid);

	return json({ token, url: `/s/${token}` });
};
