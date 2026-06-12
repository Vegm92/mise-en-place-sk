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
import { VALID_CATEGORIES, CATEGORY_COLORS } from '../src/lib/constants';
import { SUPPLIER_CATEGORIES } from '../synth/js/data/commodities.mjs';
import { DEFAULT_BUDGETS } from '../synth/js/data/budget-defaults.mjs';

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

	it('every seeded supplier category is canonical', () => {
		for (const cat of SUPPLIER_CATEGORIES) {
			expect(canonical.has(cat), `supplier category "${cat}" not in VALID_CATEGORIES`).toBe(true);
		}
	});

	it('every seeded budget category is canonical', () => {
		for (const [cat] of DEFAULT_BUDGETS) {
			expect(canonical.has(cat), `budget category "${cat}" not in VALID_CATEGORIES`).toBe(true);
		}
	});
});
