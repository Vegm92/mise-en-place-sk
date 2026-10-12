import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { getTrendDataByRange } from '$lib/server/trend';
import { apiError } from '$lib/server/api-response';

export const GET: RequestHandler = async ({ url, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) return apiError(409, 'No active restaurant');

	if (!await rateLimitScoped({ scope: 'user', name: 'trend', max: 60 }, { userId: locals.user!.id })) {
		return apiError(429, 'Too many requests');
	}
	const data = await getTrendDataByRange(rid, url.searchParams.get('range'), url.searchParams.get('granularity'));
	return json(data);
};
