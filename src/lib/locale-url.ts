import type { Locale } from './i18n-messages';

export const LOCALE_PARAM = 'lang';
export const DEFAULT_LOCALE: Locale = 'es';

export function parseLocale(value: string | null | undefined): Locale | null {
	return value === 'es' || value === 'en' ? value : null;
}

export function otherLocale(locale: Locale): Locale {
	return locale === 'es' ? 'en' : 'es';
}

export function requestedLocale(url: URL): Locale | null {
	return parseLocale(url.searchParams.get(LOCALE_PARAM));
}

export function localeHref(url: URL, target: Locale): string {
	const params = new URLSearchParams(url.search);
	params.set(LOCALE_PARAM, target);
	return `${url.pathname}?${params.toString()}`;
}
