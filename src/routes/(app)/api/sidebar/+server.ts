import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/schema';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';

const SidebarBody = v.object({
	collapsed: v.boolean('Invalid collapsed'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !locals.restaurantId) return apiError(401, 'Unauthorized');

	if (!await rateLimitScoped({ scope: 'user', name: 'sidebar', max: 60 }, { userId: locals.user.id })) {
		return apiError(429, 'Too many requests');
	}

	const parsed = await parseJson(SidebarBody, request);
	if (!parsed.success) return invalidBody(parsed, 400, 'Invalid collapsed');

	const value = String(parsed.output.collapsed);

	await db
		.insert(settings)
		.values({ restaurantId: locals.restaurantId, key: 'sidebar_collapsed', value })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value },
		});

	return json({ ok: true });
};
