import { describe, it, expect } from 'vitest';
import { sparkPath, windowAvg, delta, statusTier } from '../src/lib/pulse-math';

describe('sparkPath', () => {
	it('returns null with fewer than two points', () => {
		expect(sparkPath([])).toBeNull();
		expect(sparkPath([0.9])).toBeNull();
	});

	it('skips null points but keeps their slot in the x axis', () => {
		const d = sparkPath([0.8, null, 0.9], 100, 28);
		expect(d).toBe('M 0.00 28.00 L 100.00 0.00');
	});

	it('flattens a constant series to the vertical midpoint', () => {
		const d = sparkPath([0.9, 0.9, 0.9], 100, 28);
		expect(d).toBe('M 0.00 28.00 L 50.00 28.00 L 100.00 28.00');
	});
});

describe('windowAvg', () => {
	const series = [1, 2, 3, 4, 5, 6];

	it('averages the last `len` values when fromEnd is 0', () => {
		expect(windowAvg(series, 0, 3)).toBe(5);
	});

	it('averages the window before the last `fromEnd` values', () => {
		expect(windowAvg(series, 3, 3)).toBe(2);
	});

	it('ignores nulls and returns null for an empty window', () => {
		expect(windowAvg([null, null], 0, 2)).toBeNull();
		expect(windowAvg([1, null, 3], 0, 3)).toBe(2);
	});
});

describe('delta', () => {
	it('returns null if either side is missing', () => {
		expect(delta(null, 1)).toBeNull();
		expect(delta(1, null)).toBeNull();
	});

	it('reports percentage-point movement and direction', () => {
		const up = delta(0.9, 0.85);
		expect(up?.up).toBe(true);
		expect(up?.pp).toBeCloseTo(5);

		const down = delta(0.8, 0.85);
		expect(down?.up).toBe(false);
		expect(down?.pp).toBeCloseTo(-5);
	});
});

describe('statusTier', () => {
	it('grades a higher-is-better metric (confidence)', () => {
		expect(statusTier(0.9, 0.85, 0.7, true)).toBe('good');
		expect(statusTier(0.75, 0.85, 0.7, true)).toBe('warn');
		expect(statusTier(0.5, 0.85, 0.7, true)).toBe('bad');
		expect(statusTier(null, 0.85, 0.7, true)).toBeNull();
	});

	it('grades a lower-is-better metric (mismatch rate)', () => {
		expect(statusTier(0.05, 0.10, 0.25, false)).toBe('good');
		expect(statusTier(0.15, 0.10, 0.25, false)).toBe('warn');
		expect(statusTier(0.30, 0.10, 0.25, false)).toBe('bad');
	});
});
