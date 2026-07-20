import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { getTrendData } from '$lib/server/trend';

export const GET: RequestHandler = async ({ url, getClientAddress, locals }) => {
	if (!await checkRateLimit(getClientAddress(), 60)) throw error(429, 'Too many requests');
	const rid = locals.restaurantId!;
	const data = await getTrendData(rid, url.searchParams.get('scale'));
	return json(data);
};
