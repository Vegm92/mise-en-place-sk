/**
 * src/lib/landing-copy.ts — the override-resolution mechanism (issue #327).
 *
 * `overrideFor`/`interpolate` are the pure core LandingPage.svelte builds its
 * locally-scoped `t`/`ti` shadow stores from — a variant key falls back to
 * the base i18n table when it has no override, in both locales, and an
 * interpolated (`ti`-style) override still substitutes `{vars}` the same
 * way the base `ti` store does.
 */
import { describe, it, expect } from 'vitest';
import { overrideFor, interpolate, type LandingOverrides } from '../src/lib/landing-copy';
import { translations } from '../src/lib/i18n-messages';

const OVERRIDES: LandingOverrides = {
	es: { 'waitlist.headline': 'Titular ES override' },
	en: { 'waitlist.headline': 'EN override headline' },
};

describe('overrideFor', () => {
	it('returns the override for a key that has one, per locale', () => {
		expect(overrideFor(OVERRIDES, 'es', 'waitlist.headline')).toBe('Titular ES override');
		expect(overrideFor(OVERRIDES, 'en', 'waitlist.headline')).toBe('EN override headline');
	});

	it('falls back to undefined (not the base string) for a key with no override, so the caller can fall back to t itself', () => {
		expect(overrideFor(OVERRIDES, 'es', 'waitlist.sub')).toBeUndefined();
		expect(overrideFor(OVERRIDES, 'en', 'waitlist.sub')).toBeUndefined();
	});

	it('falls back to undefined for every key when overrides is null/undefined', () => {
		expect(overrideFor(null, 'es', 'waitlist.headline')).toBeUndefined();
		expect(overrideFor(undefined, 'es', 'waitlist.headline')).toBeUndefined();
	});

	it('falls back to undefined for a locale the overrides object does not cover', () => {
		const esOnly: LandingOverrides = { es: { 'waitlist.headline': 'Solo ES' } };
		expect(overrideFor(esOnly, 'en', 'waitlist.headline')).toBeUndefined();
		expect(overrideFor(esOnly, 'es', 'waitlist.headline')).toBe('Solo ES');
	});
});

describe('a t-shaped resolver built on overrideFor: override-or-base, in both locales', () => {
	function tv(overrides: LandingOverrides | null, loc: 'es' | 'en', key: string): string {
		return overrideFor(overrides, loc, key) ?? (translations[loc] as Record<string, string>)[key];
	}

	it('uses the override when present', () => {
		expect(tv(OVERRIDES, 'es', 'waitlist.headline')).toBe('Titular ES override');
	});

	it('falls back to the base table for a key with no override, in Spanish', () => {
		expect(tv(OVERRIDES, 'es', 'waitlist.sub')).toBe(translations.es['waitlist.sub']);
	});

	it('falls back to the base table for a key with no override, in English', () => {
		expect(tv(OVERRIDES, 'en', 'waitlist.sub')).toBe(translations.en['waitlist.sub']);
	});

	it('falls back to the base table entirely when no overrides are supplied at all', () => {
		expect(tv(null, 'es', 'waitlist.headline')).toBe(translations.es['waitlist.headline']);
		expect(tv(null, 'en', 'waitlist.headline')).toBe(translations.en['waitlist.headline']);
	});
});

describe('interpolate', () => {
	it('substitutes every {var} placeholder', () => {
		expect(interpolate('{a} plus {b} is {c}', { a: 1, b: 2, c: 3 })).toBe('1 plus 2 is 3');
	});

	it('matches the base ti store\'s substitution semantics (replaceAll of {key})', () => {
		const vars = { starter: 29, pro: 59, business: 129 };
		const baseRendered = Object.entries(vars).reduce(
			(s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
			translations.es['waitlist.faq.3.a'],
		);
		expect(interpolate(translations.es['waitlist.faq.3.a'], vars)).toBe(baseRendered);
	});

	it('leaves an override template with no matching vars untouched', () => {
		expect(interpolate('No placeholders here.', { unused: 1 })).toBe('No placeholders here.');
	});
});
