import { describe, expect, it } from 'vitest';
import { TOUR_PAGES, tourPageAccessible, nextAccessibleIndex } from '../src/lib/tour-gating';

describe('tourPageAccessible', () => {
	it('allows every current tour page regardless of tier (none are feature-gated today)', () => {
		for (const page of TOUR_PAGES) {
			expect(tourPageAccessible(page.path, {})).toBe(true);
		}
	});
});

describe('nextAccessibleIndex', () => {
	it('walks a trial-tier user through the whole tour without skipping any step', () => {
		const trialFeatures = { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false };
		let idx = nextAccessibleIndex(TOUR_PAGES, 0, trialFeatures);
		const visited: string[] = [];
		while (idx !== -1) {
			visited.push(TOUR_PAGES[idx].path);
			idx = nextAccessibleIndex(TOUR_PAGES, idx + 1, trialFeatures);
		}
		expect(visited.length).toBe(TOUR_PAGES.length);
	});

	it('returns -1 when no accessible step remains', () => {
		expect(nextAccessibleIndex(TOUR_PAGES, TOUR_PAGES.length, {})).toBe(-1);
	});
});
