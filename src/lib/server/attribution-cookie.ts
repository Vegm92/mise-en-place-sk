import type { Cookies } from '@sveltejs/kit';
import {
	ATTRIBUTION_COOKIE,
	hasAttributionSignal,
	parseAttribution,
	serializeAttribution,
	type Attribution,
} from '$lib/attribution';

const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function captureAttribution(
	cookies: Cookies,
	url: URL,
	referer: string | null,
	extra?: Partial<Attribution>,
): void {
	const incoming: Attribution = { ...parseAttribution(url, referer), ...extra };
	const existing = cookies.get(ATTRIBUTION_COOKIE);

	if (!existing || hasAttributionSignal(incoming)) {
		cookies.set(ATTRIBUTION_COOKIE, serializeAttribution(incoming), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: ATTRIBUTION_COOKIE_MAX_AGE,
		});
	}
}
