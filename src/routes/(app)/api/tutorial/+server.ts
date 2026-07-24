import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';

const VALID: readonly string[] = [
	'1', '2', 'done',
	'3', '4', '5', '6', '7', '8', '9', '10', '11',
	'dismissed',
];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.restaurantId) error(401, 'Unauthorized');

	const body = await request.json() as { step?: string };
	const step = body?.step;

	if (!step || !VALID.includes(step)) error(400, 'Invalid step');

	await db
		.insert(settings)
		.values({ restaurantId: locals.restaurantId, key: 'tutorial_step', value: step })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value: step },
		});

	return json({ ok: true });
};
