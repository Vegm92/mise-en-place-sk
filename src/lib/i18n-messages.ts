import es from './messages/es';
import en from './messages/en';

export type Locale = 'es' | 'en';

export const translations = { es, en } satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof typeof translations.es;
export type WaitlistKey = Extract<TranslationKey, `waitlist.${string}`>;

export function renderTemplate(loc: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const template = (translations[loc] as Record<string, string>)[key] ?? key;
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
}
