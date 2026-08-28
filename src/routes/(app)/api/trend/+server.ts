import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { getTrendDataByRange } from '$lib/server/trend';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!await rateLimitScoped({ scope: 'user', name: 'trend', max: 60 }, { userId: locals.user!.id })) {
		throw error(429, 'Too many requests');
	}
	const rid = locals.restaurantId!;
	const data = await getTrendDataByRange(rid, url.searchParams.get('range'), url.searchParams.get('granularity'));
	return json(data);
};
