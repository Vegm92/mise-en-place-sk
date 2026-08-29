import { resolveLocale, LOCALE_COOKIE } from '$lib/server/locale';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ url, cookies }) =>
	resolveLocale(url, cookies.get(LOCALE_COOKIE));
