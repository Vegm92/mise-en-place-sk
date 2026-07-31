import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { userRestaurants } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { checkRateLimit } from '$lib/server/rate-limiter';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	if (!(await checkRateLimit(`switch-restaurant:${user.id}`, 30))) {
		throw error(429, 'Too many requests — please wait a moment and try again');
	}

	const body = await request.json().catch(() => null);
	const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : '';
	if (!restaurantId) throw error(400, 'restaurantId is required');

	const target = forTenant(restaurantId);
	const [membership] = await db.select({ restaurantId: userRestaurants.restaurantId })
		.from(userRestaurants)
		.where(target.scope(userRestaurants.restaurantId, eq(userRestaurants.userId, user.id)))
		.limit(1);
	if (!membership) throw error(403, 'Not a member of that restaurant');

	cookies.set('active_restaurant', restaurantId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 365,
	});

	return json({ restaurantId });
};
