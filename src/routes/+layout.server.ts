import { resolveLocale, LOCALE_COOKIE } from '$lib/server/locale';
import { readConsent } from '$lib/server/cookie-consent';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ url, cookies }) => ({
	...resolveLocale(url, cookies.get(LOCALE_COOKIE)),
	cookieConsent: readConsent(cookies),
});
