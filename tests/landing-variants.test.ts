/**
 * Landing variant registry — issue #327.
 *
 * `LANDING_VARIANTS` supplies each niche's copy as overrides for a subset of
 * `waitlist.*` i18n keys, resolved ahead of the base table at render time
 * (see landing-copy.ts / LandingPage.svelte). This file checks the registry
 * itself: the launch set is exactly the five slugs the issue named, every
 * override key is a real `waitlist.*` key that exists in both locale tables
 * (TypeScript already enforces this at compile time via `WaitlistKey`, but a
 * runtime check catches a stale build or a future non-typed caller), both
 * locales define the same key set per variant (no lopsided es/en coverage),
 * and every override actually differs from the base copy it replaces — a
 * variant that silently fell back to the base string would defeat the
 * point ("commits to its niche, doesn't soften the general message").
 */
import { describe, it, expect } from 'vitest';
import { LANDING_VARIANTS, getLandingVariant, landingVariantSlugs, venueTypeForLandingVariant } from '../src/lib/landing-variants';
import { translations, type Locale } from '../src/lib/i18n-messages';

const LAUNCH_SLUGS = ['menu-del-dia', 'aceite-de-oliva', 'verifactu-2027', 'grupo-multi-local', 'pescado-fresco'];
const LOCALES: Locale[] = ['es', 'en'];

describe('landingVariantSlugs — launch set', () => {
	it('is exactly the five slugs named in issue #327', () => {
		expect(landingVariantSlugs().sort()).toEqual([...LAUNCH_SLUGS].sort());
	});
});

describe('getLandingVariant — known/unknown resolution', () => {
	it('resolves each launch slug', () => {
		for (const slug of LAUNCH_SLUGS) {
			const variant = getLandingVariant(slug);
			expect(variant, slug).not.toBeNull();
			expect(variant!.slug).toBe(slug);
		}
	});

	it('returns null for an unknown slug', () => {
		expect(getLandingVariant('unknown-slug')).toBeNull();
		expect(getLandingVariant('')).toBeNull();
	});

	it('does not resolve a JS Object.prototype property as a slug', () => {
		expect(getLandingVariant('toString')).toBeNull();
		expect(getLandingVariant('constructor')).toBeNull();
		expect(getLandingVariant('hasOwnProperty')).toBeNull();
	});
});

describe('every variant override key exists in both locale tables', () => {
	for (const slug of LAUNCH_SLUGS) {
		const variant = LANDING_VARIANTS[slug];
		for (const loc of LOCALES) {
			it(`${slug} (${loc}) overrides only real waitlist.* keys`, () => {
				const keys = Object.keys(variant!.overrides[loc]);
				expect(keys.length).toBeGreaterThan(0);
				for (const key of keys) {
					expect(key.startsWith('waitlist.'), key).toBe(true);
					expect(
						Object.prototype.hasOwnProperty.call(translations[loc], key),
						`${slug}/${loc}: "${key}" is not a real i18n key`,
					).toBe(true);
				}
			});
		}
	}
});

describe('every variant defines the same override keys in es and en', () => {
	for (const slug of LAUNCH_SLUGS) {
		it(`${slug}: es and en override the same key set`, () => {
			const variant = LANDING_VARIANTS[slug];
			const esKeys = Object.keys(variant!.overrides.es).sort();
			const enKeys = Object.keys(variant!.overrides.en).sort();
			expect(enKeys).toEqual(esKeys);
		});
	}
});

describe('every variant override commits to its niche (differs from the base copy)', () => {
	for (const slug of LAUNCH_SLUGS) {
		for (const loc of LOCALES) {
			it(`${slug} (${loc}): no override is byte-identical to the base waitlist.* string`, () => {
				const variant = LANDING_VARIANTS[slug];
				const base = translations[loc] as Record<string, string>;
				for (const [key, value] of Object.entries(variant!.overrides[loc])) {
					expect(value, `${slug}/${loc}/${key} did not change from the base string`).not.toBe(base[key]);
				}
			});
		}
	}
});

describe('venueTypeForLandingVariant — onboarding venue-type preselection (issue #328)', () => {
	it('maps menu-del-dia to menu_del_dia', () => {
		expect(venueTypeForLandingVariant('menu-del-dia')).toBe('menu_del_dia');
	});

	it('maps grupo-multi-local to grupo', () => {
		expect(venueTypeForLandingVariant('grupo-multi-local')).toBe('grupo');
	});

	it('returns null for a launch slug with no venue-type mapping', () => {
		expect(venueTypeForLandingVariant('aceite-de-oliva')).toBeNull();
		expect(venueTypeForLandingVariant('verifactu-2027')).toBeNull();
		expect(venueTypeForLandingVariant('pescado-fresco')).toBeNull();
	});

	it('returns null for an unknown or missing variant', () => {
		expect(venueTypeForLandingVariant('unknown-slug')).toBeNull();
		expect(venueTypeForLandingVariant(null)).toBeNull();
		expect(venueTypeForLandingVariant(undefined)).toBeNull();
		expect(venueTypeForLandingVariant('')).toBeNull();
	});
});

describe('the menu-del-dia launch copy matches the issue #327 example', () => {
	it('headline, sub and pain.0.stat match the example given in the issue', () => {
		const es = LANDING_VARIANTS['menu-del-dia']!.overrides.es;
		expect(es['waitlist.headline']).toBe('Tu menú vale 13 €. Tu aceite ya no.');
		expect(es['waitlist.sub']).toBe(
			'Para cocinas de menú del día: detectamos cada subida de proveedor el mismo día, ' +
			'para que defiendas el margen que tu carta no puede subir.',
		);
		expect(es['waitlist.pain.0.stat']).toBe('0,42 €');
	});
});
