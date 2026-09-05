/**
 * Recipe food-cost trend (ADR-039): the recipe graph is re-priced as of each of
 * the last six month-ends plus today, so the list can show how the cost per
 * portion moved without a snapshot table. These pin the date grid and the
 * delta the list column shows.
 */
import { describe, it, expect } from 'vitest';
import { costDeltaPct, trendAsOfDates } from '../src/lib/server/recipes';

describe('trendAsOfDates', () => {
	it('lists the previous month-ends oldest first and ends with today', () => {
		expect(trendAsOfDates('2026-09-05', 3)).toEqual(['2026-06-30', '2026-07-31', '2026-08-31', '2026-09-05']);
		expect(trendAsOfDates('2026-03-10', 2)).toEqual(['2026-01-31', '2026-02-28', '2026-03-10']);
		expect(trendAsOfDates('2026-01-15', 1)).toEqual(['2025-12-31', '2026-01-15']);
	});
});

describe('costDeltaPct', () => {
	const point = (asOf: string, cents: number | null) => ({ asOf, costPerPortionCents: cents, foodCostPct: null });
	it('compares today with the earliest month-end that had a complete price', () => {
		expect(costDeltaPct([point('2026-06-30', null), point('2026-07-31', 400), point('2026-08-31', 420), point('2026-09-05', 460)])).toBe(15);
		expect(costDeltaPct([point('2026-07-31', 500), point('2026-09-05', 450)])).toBe(-10);
	});
	it('is null without two priced points', () => {
		expect(costDeltaPct(undefined)).toBeNull();
		expect(costDeltaPct([point('2026-09-05', 460)])).toBeNull();
		expect(costDeltaPct([point('2026-07-31', null), point('2026-09-05', 460)])).toBeNull();
		expect(costDeltaPct([point('2026-07-31', 400), point('2026-09-05', null)])).toBeNull();
	});
});
