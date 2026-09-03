import { categorySlug } from './constants';
import type { Locale } from './i18n-messages';

const LOCALE_COOKIE = 'mep-locale';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type { Locale, TranslationKey, WaitlistKey } from './i18n-messages';

export const messageLoaders: Record<Locale, () => Promise<{ default: Record<string, string> }>> = {
  es: () => import('./messages/es'),
  en: () => import('./messages/en'),
};

const messageCache: Partial<Record<Locale, Record<string, string>>> = {};
const pluralRules: Partial<Record<Locale, Intl.PluralRules>> = {};

const i18n = $state<{ locale: Locale; messages: Record<string, string> }>({ locale: 'es', messages: {} });

let persisting = false;

export const locale = {
  get current(): Locale {
    return i18n.locale;
  },
};

export function setMessages(loc: Locale, table: Record<string, string>) {
  messageCache[loc] = table;
  i18n.messages = table;
}

function applyLocale(loc: Locale) {
  const cached = messageCache[loc];
  if (cached) {
    i18n.messages = cached;
    return;
  }
  messageLoaders[loc]().then((mod) => {
    messageCache[loc] = mod.default;
    if (i18n.locale === loc) i18n.messages = mod.default;
  });
}

export function setLocale(loc: Locale) {
  i18n.locale = loc;
  applyLocale(loc);
  if (persisting) persistLocale(loc);
}

export function toggleLocale() {
  setLocale(i18n.locale === 'es' ? 'en' : 'es');
}

export function loadAllMessages(): Promise<void> {
  return Promise.all(
    (Object.keys(messageLoaders) as Locale[]).map((loc) =>
      messageLoaders[loc]().then((mod) => {
        messageCache[loc] = mod.default;
      }),
    ),
  ).then(() => undefined);
}

export function t(key: string): string {
  return i18n.messages[key] ?? key;
}

export function ti(key: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    t(key),
  );
}

export function tcat(canonical: string | null | undefined): string {
  if (!canonical) return t('sup.noCategory');
  const key = `category.${categorySlug(canonical)}`;
  const label = t(key);
  return label === key ? canonical : label;
}

export function tiv(key: string, vars: Record<string, string | number>): string {
  return ti(
    key,
    'category' in vars
      ? { ...vars, category: tcat(String(vars.category)) }
      : vars,
  );
}

export function tp(key: string, count: number): string {
  const loc = i18n.locale;
  const pr = (pluralRules[loc] ??= new Intl.PluralRules(loc));
  if (count === 0) {
    const zeroKey = `${key}.zero`;
    const zero = t(zeroKey);
    if (zero !== zeroKey) return zero.replaceAll('{n}', String(count));
  }
  return t(`${key}.${pr.select(count)}`).replaceAll('{n}', String(count));
}

function persistLocale(value: Locale) {
  localStorage.setItem(LOCALE_COOKIE, value);
  document.cookie = `${LOCALE_COOKIE}=${value};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
}

export function initLocale(serverLocale?: Locale, serverExplicit = false) {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem(LOCALE_COOKIE) as Locale | null;
  const remembered = stored === 'es' || stored === 'en' ? stored : null;
  const initial = serverExplicit ? serverLocale : (remembered ?? serverLocale);
  if (initial) setLocale(initial);
  persisting = true;
  persistLocale(i18n.locale);
}
