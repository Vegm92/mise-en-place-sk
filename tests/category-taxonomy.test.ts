/**
 * Category taxonomy guard.
 *
 * The app has ONE canonical category list (VALID_CATEGORIES in src/lib/constants.ts).
 * Suppliers (suppliers.category) and budgets (category_budgets.category) must store
 * one of those exact strings, or the budgets page renders duplicate/orphan rows and
 * spend never maps onto a budget (the bug this guard prevents from recurring).
 *
 * These checks are pure data assertions — no DB required — so they run in CI on
 * every change to the taxonomy or the seed generators.
 */
import { describe, it, expect } from 'vitest';
import { VALID_CATEGORIES, categorySlug } from '../src/lib/constants';
import { CATEGORY_COLORS } from '../src/lib/colors';
import { translations } from '../src/lib/i18n-messages';

const canonical = new Set(VALID_CATEGORIES);

describe('category taxonomy', () => {
	it('VALID_CATEGORIES has no duplicates', () => {
		expect(VALID_CATEGORIES.length).toBe(canonical.size);
	});

	it('every canonical category has a swatch color', () => {
		for (const cat of VALID_CATEGORIES) {
			expect(CATEGORY_COLORS[cat], `missing color for "${cat}"`).toBeTruthy();
		}
	});

	it('CATEGORY_COLORS has no keys outside the canonical list', () => {
		for (const key of Object.keys(CATEGORY_COLORS)) {
			expect(canonical.has(key), `stray color key "${key}"`).toBe(true);
		}
	});

});

describe('category display labels (issue #338)', () => {
	it('slugs are unique and i18n-key safe', () => {
		const slugs = VALID_CATEGORIES.map(categorySlug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
	});

	it('every canonical category has a label in both locales', () => {
		const missing: string[] = [];
		for (const lc of ['es', 'en'] as const) {
			for (const cat of VALID_CATEGORIES) {
				const key = `category.${categorySlug(cat)}`;
				if (!(key in translations[lc])) missing.push(`${lc}:${key}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('has no category.* keys outside the canonical list', () => {
		const expected = new Set(VALID_CATEGORIES.map((c) => `category.${categorySlug(c)}`));
		for (const lc of ['es', 'en'] as const) {
			for (const key of Object.keys(translations[lc])) {
				if (!key.startsWith('category.')) continue;
				expect(expected.has(key), `stray key "${key}" in ${lc}`).toBe(true);
			}
		}
	});
});
