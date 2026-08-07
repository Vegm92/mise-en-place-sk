import { describe, expect, it } from 'vitest';
import { TOUR_PAGES, tourPageAccessible, nextAccessibleIndex } from '../src/lib/tour-gating';

describe('tourPageAccessible', () => {
	it('allows a page with no feature requirement regardless of tier', () => {
		expect(tourPageAccessible('/dashboard', {})).toBe(true);
	});

	it('blocks a gated page when the required feature is false', () => {
		expect(tourPageAccessible('/digest', { weeklyDigest: false })).toBe(false);
	});

	it('allows a gated page when the required feature is true', () => {
		expect(tourPageAccessible('/digest', { weeklyDigest: true })).toBe(true);
	});
});

describe('nextAccessibleIndex', () => {
	it('skips a gated step and lands on the next accessible one', () => {
		const digestIndex = TOUR_PAGES.findIndex(p => p.path === '/digest');
		const trialFeatures = { weeklyDigest: false };
		const idx = nextAccessibleIndex(TOUR_PAGES, digestIndex, trialFeatures);
		expect(TOUR_PAGES[idx].path).not.toBe('/digest');
	});

	it('walks a trial-tier user through the whole tour without ever landing on /digest', () => {
		const trialFeatures = { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false };
		let idx = nextAccessibleIndex(TOUR_PAGES, 0, trialFeatures);
		const visited: string[] = [];
		while (idx !== -1) {
			visited.push(TOUR_PAGES[idx].path);
			idx = nextAccessibleIndex(TOUR_PAGES, idx + 1, trialFeatures);
		}
		expect(visited).not.toContain('/digest');
		expect(visited.length).toBe(TOUR_PAGES.length - 1);
	});

	it('returns -1 when no accessible step remains', () => {
		expect(nextAccessibleIndex(TOUR_PAGES, TOUR_PAGES.length, {})).toBe(-1);
	});
});
