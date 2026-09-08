import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { memberLocations } from '$lib/server/locations';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';

const RESTAURANT_ID_REQUIRED = 'restaurantId is required';

const SwitchBody = v.object({
	restaurantId: v.pipe(v.string(RESTAURANT_ID_REQUIRED), v.minLength(1, RESTAURANT_ID_REQUIRED)),
});

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const user = locals.user;
	if (!user) return apiError(401, 'Unauthorized');

	if (!(await rateLimitScoped({ scope: 'user', name: 'switch-restaurant', max: 30 }, { userId: user.id }))) {
		return apiError(429, 'Too many requests — please wait a moment and try again');
	}

	const parsed = await parseJson(SwitchBody, request);
	if (!parsed.success) return invalidBody(parsed, 400, RESTAURANT_ID_REQUIRED);
	const { restaurantId } = parsed.output;

	const locations = await memberLocations(user.id);
	const target = locations.find(l => l.restaurantId === restaurantId);
	if (!target) return apiError(403, 'Not a member of that restaurant');
	if (target.locked) return apiError(403, 'set.locations.err.lockedSwitch');

	cookies.set('active_restaurant', restaurantId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 365,
	});

	return json({ restaurantId });
};
