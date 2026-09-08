import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { settings } from '$lib/server/schema';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';

const VALID = [
	'1', '2', 'done',
	'3', '4', '5', '6', '7', '8', '9', '10', '11',
	'dismissed',
] as const;

const TutorialBody = v.object({
	step: v.picklist(VALID, 'Invalid step'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.restaurantId) return apiError(401, 'Unauthorized');

	const parsed = await parseJson(TutorialBody, request);
	if (!parsed.success) return invalidBody(parsed, 400, 'Invalid step');

	const step = parsed.output.step;

	await db
		.insert(settings)
		.values({ restaurantId: locals.restaurantId, key: 'tutorial_step', value: step })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value: step },
		});

	return json({ ok: true });
};
