import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { getTrendDataByRange } from '$lib/server/trend';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!await checkRateLimit(`trend:${locals.user!.id}`, 60)) throw error(429, 'Too many requests');
	const rid = locals.restaurantId!;
	const data = await getTrendDataByRange(rid, url.searchParams.get('range'), url.searchParams.get('granularity'));
	return json(data);
};
