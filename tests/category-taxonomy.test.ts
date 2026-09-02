/**
 * Default category taxonomy guard.
 *
 * VALID_CATEGORIES in src/lib/constants.ts is no longer the only categories a
 * restaurant can have (issue #881 — categories are now a per-restaurant
 * `categories` table, seeded from this list). It is still the DEFAULT SEED
 * every restaurant starts with, and the fixed set the extraction prompt's
 * category guide is built from (ADR-034), so it must stay internally
 * consistent: no duplicates, a swatch color and a bilingual label for every
 * entry, and no stray colors/labels for names outside it.
 *
 * These checks are pure data assertions — no DB required — so they run in CI on
 * every change to the default taxonomy or the seed generators. DB-backed
 * coverage of the per-restaurant `categories` table itself lives in
 * tests/supplier-category.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { VALID_CATEGORIES, categorySlug } from '../src/lib/constants';
import { CATEGORY_COLORS } from '../src/lib/colors';
import { translations } from '../src/lib/i18n-messages';

const canonical = new Set(VALID_CATEGORIES);

describe('default category taxonomy (seed list)', () => {
	it('VALID_CATEGORIES has no duplicates', () => {
		expect(VALID_CATEGORIES.length).toBe(canonical.size);
	});

	it('every seed category has a swatch color', () => {
		for (const cat of VALID_CATEGORIES) {
			expect(CATEGORY_COLORS[cat], `missing color for "${cat}"`).toBeTruthy();
		}
	});

	it('CATEGORY_COLORS has no keys outside the seed list', () => {
		for (const key of Object.keys(CATEGORY_COLORS)) {
			expect(canonical.has(key), `stray color key "${key}"`).toBe(true);
		}
	});

});

describe('default category display labels (issue #338)', () => {
	it('slugs are unique and i18n-key safe', () => {
		const slugs = VALID_CATEGORIES.map(categorySlug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
	});

	it('every seed category has a label in both locales', () => {
		const missing: string[] = [];
		for (const lc of ['es', 'en'] as const) {
			for (const cat of VALID_CATEGORIES) {
				const key = `category.${categorySlug(cat)}`;
				if (!(key in translations[lc])) missing.push(`${lc}:${key}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('has no category.* keys outside the seed list', () => {
		const expected = new Set(VALID_CATEGORIES.map((c) => `category.${categorySlug(c)}`));
		for (const lc of ['es', 'en'] as const) {
			for (const key of Object.keys(translations[lc])) {
				if (!key.startsWith('category.')) continue;
				expect(expected.has(key), `stray key "${key}" in ${lc}`).toBe(true);
			}
		}
	});
});
