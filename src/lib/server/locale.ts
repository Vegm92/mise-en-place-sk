import { getRequestEvent } from '$app/server';
import type { Cookies } from '@sveltejs/kit';
import { DEFAULT_LOCALE, parseLocale, requestedLocale } from '$lib/locale-url';
import type { Locale } from '$lib/i18n-messages';

export const LOCALE_COOKIE = 'mep-locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ResolvedLocale = { locale: Locale; explicit: boolean };

export function resolveLocale(url: URL, cookieValue: string | undefined): ResolvedLocale {
	const requested = requestedLocale(url);
	if (requested) return { locale: requested, explicit: true };

	const remembered = parseLocale(cookieValue);
	if (remembered) return { locale: remembered, explicit: true };

	return { locale: DEFAULT_LOCALE, explicit: false };
}

export function rememberLocale(cookies: Cookies, locale: Locale): void {
	if (cookies.get(LOCALE_COOKIE) === locale) return;
	cookies.set(LOCALE_COOKIE, locale, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: LOCALE_COOKIE_MAX_AGE,
	});
}

export function currentLocale(): ResolvedLocale {
	const { cookies, url } = getRequestEvent();
	return resolveLocale(url, cookies.get(LOCALE_COOKIE));
}

export function rememberCurrentLocale(locale: Locale): void {
	const { cookies } = getRequestEvent();
	rememberLocale(cookies, locale);
}
