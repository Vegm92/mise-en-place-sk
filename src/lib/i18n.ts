import { writable, derived } from 'svelte/store';
import { categorySlug } from './constants';
import { translations, type Locale } from './i18n-messages';

const LOCALE_COOKIE = 'mep-locale';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export { translations, renderTemplate, type Locale, type TranslationKey, type WaitlistKey } from './i18n-messages';

export const locale = writable<Locale>('es');

export const t = derived(locale, ($locale) => (key: string): string => {
  return (translations[$locale] as Record<string, string>)[key] ?? key;
});

export const ti = derived(
  t,
  ($t) =>
    (key: string, vars: Record<string, string | number>): string =>
      Object.entries(vars).reduce(
        (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
        $t(key),
      ),
);

export const tcat = derived(t, ($t) => (canonical: string | null | undefined): string => {
  if (!canonical) return $t('sup.noCategory');
  const key = `category.${categorySlug(canonical)}`;
  const label = $t(key);
  return label === key ? canonical : label;
});

export const tiv = derived(
  [ti, tcat],
  ([$ti, $tcat]) =>
    (key: string, vars: Record<string, string | number>): string =>
      $ti(
        key,
        'category' in vars
          ? { ...vars, category: $tcat(String(vars.category)) }
          : vars,
      ),
);

export const tp = derived(
  [t, locale],
  ([$t, $locale]) => {
    const pr = new Intl.PluralRules($locale);
    return (key: string, count: number): string => {
      if (count === 0) {
        const zeroKey = `${key}.zero`;
        const zero = $t(zeroKey);
        if (zero !== zeroKey) return zero.replaceAll('{n}', String(count));
      }
      return $t(`${key}.${pr.select(count)}`).replaceAll('{n}', String(count));
    };
  },
);

function persistLocale(value: Locale) {
  localStorage.setItem(LOCALE_COOKIE, value);
  document.cookie = `${LOCALE_COOKIE}=${value};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
}

export function initLocale(serverLocale?: Locale, serverExplicit = false) {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem(LOCALE_COOKIE) as Locale | null;
  const remembered = stored === 'es' || stored === 'en' ? stored : null;
  const initial = serverExplicit ? serverLocale : (remembered ?? serverLocale);
  if (initial) locale.set(initial);
  locale.subscribe(persistLocale);
}
