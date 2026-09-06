import type { Cookies } from '@sveltejs/kit';
import {
	CONSENT_COOKIE,
	CONSENT_COOKIE_MAX_AGE,
	analyticsAllowed,
	parseConsent,
	type ConsentChoice,
	type ConsentState,
} from '$lib/cookie-consent';

export function readConsent(cookies: Cookies): ConsentState {
	return parseConsent(cookies.get(CONSENT_COOKIE));
}

export function analyticsConsentGiven(cookies: Cookies): boolean {
	return analyticsAllowed(readConsent(cookies));
}

export function writeConsent(cookies: Cookies, choice: ConsentChoice): void {
	cookies.set(CONSENT_COOKIE, choice, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: CONSENT_COOKIE_MAX_AGE,
	});
}
