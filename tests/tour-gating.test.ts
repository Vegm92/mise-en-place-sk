import { describe, expect, it } from 'vitest';
import { TOUR_PAGES, TOUR_FEATURE_REQUIREMENT, tourPageAccessible, nextAccessibleIndex } from '../src/lib/tour-gating';

describe('tourPageAccessible', () => {
	it('allows a page with no feature requirement regardless of tier', () => {
		expect(tourPageAccessible('/dashboard', {})).toBe(true);
	});

	it('blocks a gated page when the required feature is false', () => {
		expect(tourPageAccessible('/reports', { weeklyDigest: false })).toBe(false);
	});

	it('allows a gated page when the required feature is true', () => {
		expect(tourPageAccessible('/reports', { weeklyDigest: true })).toBe(true);
	});
});

describe('nextAccessibleIndex', () => {
	it('skips a gated step and lands on the next accessible one', () => {
		const reportsIndex = TOUR_PAGES.findIndex(p => p.path === '/reports');
		const trialFeatures = { weeklyDigest: false };
		const idx = nextAccessibleIndex(TOUR_PAGES, reportsIndex, trialFeatures);
		expect(TOUR_PAGES[idx]!.path).not.toBe('/reports');
	});

	it('walks a trial-tier user through the whole tour without landing on a gated page', () => {
		const trialFeatures = { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false, aiAssistant: false };
		let idx = nextAccessibleIndex(TOUR_PAGES, 0, trialFeatures);
		const visited: string[] = [];
		while (idx !== -1) {
			visited.push(TOUR_PAGES[idx]!.path);
			idx = nextAccessibleIndex(TOUR_PAGES, idx + 1, trialFeatures);
		}
		const gated = Object.keys(TOUR_FEATURE_REQUIREMENT);
		expect(gated.length).toBeGreaterThan(0);
		for (const path of gated) expect(visited).not.toContain(path);
		expect(visited.length).toBe(TOUR_PAGES.length - gated.length);
	});

	it('returns -1 when no accessible step remains', () => {
		expect(nextAccessibleIndex(TOUR_PAGES, TOUR_PAGES.length, {})).toBe(-1);
	});
});
