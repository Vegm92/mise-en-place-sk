import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { putSetting } from '$lib/server/settings-store';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';

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

	if (!await rateLimitScoped({ scope: 'tenant', name: 'tutorial', max: 60 }, { restaurantId: locals.restaurantId })) {
		return apiError(429, 'Too many requests');
	}

	const parsed = await parseJson(TutorialBody, request);
	if (!parsed.success) return invalidBody(parsed, 400, 'Invalid step');

	const step = parsed.output.step;

	await putSetting(locals.restaurantId, 'tutorial_step', step);

	return json({ ok: true });
};
