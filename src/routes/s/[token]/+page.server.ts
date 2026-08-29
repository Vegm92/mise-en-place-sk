import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildPublicDigestPayload, resolveShareToken } from '$lib/server/digest-share';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { DIGEST_SHARE_VIEW_RATE_LIMIT_RPM } from '$lib/server/env';
import { runAsSystem } from '$lib/server/db';

export const load: PageServerLoad = async ({ params, url, getClientAddress }) => {
	const ip = getClientAddress();
	if (!(await checkRateLimit(`digest-share-view:${ip}`, DIGEST_SHARE_VIEW_RATE_LIMIT_RPM))) {
		error(429, 'Too many requests');
	}

	const { resolved, payload } = await runAsSystem(async () => {
		const resolved = await resolveShareToken(params.token);
		if (!resolved) return { resolved: null, payload: null };
		return { resolved, payload: await buildPublicDigestPayload(resolved.restaurantId, resolved.week) };
	});
	if (!resolved || !payload) error(404, 'Not Found');

	return {
		token: params.token,
		canonicalUrl: `${url.origin}/s/${params.token}`,
		...payload,
	};
};
