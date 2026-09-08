import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateCurrentWeekShare } from '$lib/server/digest-share';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { apiError } from '$lib/server/api-response';

export const POST: RequestHandler = async ({ locals }) => {
	const rid = locals.restaurantId;
	if (!rid) return apiError(401, 'Unauthorized');

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'alert-share-create', max: 20 }, { restaurantId: rid }))) {
		return apiError(429, 'Too many requests');
	}

	const { token } = await getOrCreateCurrentWeekShare(rid);

	return json({ token, url: `/s/${token}` });
};
