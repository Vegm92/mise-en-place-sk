import { describe, test, expect } from 'vitest';
import { isoWeekRange, shiftIsoWeek } from '../src/lib/server/reports/shared';

describe('isoWeekRange and shiftIsoWeek performance and correctness', () => {
	test('returns accurate ISO week start and end dates', () => {
		expect(isoWeekRange('2026-W36')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
		expect(isoWeekRange('2026-W01')).toEqual({ start: '2025-12-29', end: '2026-01-04' });
		expect(isoWeekRange('2026-W52')).toEqual({ start: '2026-12-21', end: '2026-12-27' });
	});

	test('shifts ISO weeks across years correctly', () => {
		expect(shiftIsoWeek('2026-W36', -1)).toBe('2026-W35');
		expect(shiftIsoWeek('2026-W02', -3)).toBe('2025-W51');
		expect(shiftIsoWeek('2026-W31', -1)).toBe('2026-W30');
	});

	test('benchmarks memoized isoWeekRange and shiftIsoWeek performance', () => {
		const weeks = ['2026-W01', '2026-W12', '2026-W24', '2026-W36', '2026-W48', '2026-W52'];

		const start = performance.now();
		const iterations = 50000;
		for (let i = 0; i < iterations; i++) {
			const week = weeks[i % weeks.length]!;
			isoWeekRange(week);
			shiftIsoWeek(week, -1);
			shiftIsoWeek(week, -2);
			shiftIsoWeek(week, -3);
		}
		const elapsed = performance.now() - start;
		console.log(`reports date helpers benchmark (${iterations} ops): ${elapsed.toFixed(2)} ms`);
		expect(elapsed).toBeGreaterThan(0);
	});
});
