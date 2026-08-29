import type { Locale, WaitlistKey } from './i18n';

export type LandingOverrides = Partial<Record<Locale, Partial<Record<WaitlistKey, string>>>>;

export function overrideFor(
	overrides: LandingOverrides | null | undefined,
	locale: Locale,
	key: WaitlistKey | string,
): string | undefined {
	return overrides?.[locale]?.[key as WaitlistKey];
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
	return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
}
