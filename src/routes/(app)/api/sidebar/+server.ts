import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/schema';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.restaurantId) error(401, 'Unauthorized');

	const body = await request.json() as { collapsed?: unknown };

	if (typeof body?.collapsed !== 'boolean') error(400, 'Invalid collapsed');

	await db
		.insert(settings)
		.values({ restaurantId: locals.restaurantId, key: 'sidebar_collapsed', value: String(body.collapsed) })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value: String(body.collapsed) },
		});

	return json({ ok: true });
};
