import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildPublicDigestPayload, resolveShareToken } from '$lib/server/digest-share';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { DIGEST_SHARE_VIEW_RATE_LIMIT_RPM } from '$lib/server/env';

export const load: PageServerLoad = async ({ params, url, getClientAddress }) => {
	const ip = getClientAddress();
	if (!(await checkRateLimit(`digest-share-view:${ip}`, DIGEST_SHARE_VIEW_RATE_LIMIT_RPM))) {
		error(429, 'Too many requests');
	}

	const resolved = await resolveShareToken(params.token);
	if (!resolved) error(404, 'Not Found');

	const payload = await buildPublicDigestPayload(resolved.restaurantId, resolved.week);

	return {
		token: params.token,
		canonicalUrl: `${url.origin}/s/${params.token}`,
		...payload,
	};
};
