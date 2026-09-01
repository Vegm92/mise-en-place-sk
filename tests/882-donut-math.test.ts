/**
 * Pure slice-geometry math behind DonutChart.svelte (issue #882).
 *
 * The donut is drawn with per-slice `stroke-dasharray`/`stroke-dashoffset` on
 * a single circle, so getting the cumulative offsets wrong misdraws every
 * slice after the first. This is tested standalone, without mounting Svelte.
 */
import { describe, it, expect } from 'vitest';
import {
	computeDonutSlices,
	donutSeparatorAngleRad,
	donutSeparatorPoint,
	type DonutSliceInput,
} from '../src/lib/donut-math';

describe('computeDonutSlices', () => {
	const RADIUS = 70;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	it('splits the ring proportionally to each slice value', () => {
		const input: DonutSliceInput[] = [
			{ label: 'a', value: 30, color: 'var(--mep-series-1)' },
			{ label: 'b', value: 70, color: 'var(--mep-series-2)' },
		];
		const { slices, total } = computeDonutSlices(input, RADIUS);
		expect(total).toBe(100);
		expect(slices).toHaveLength(2);
		expect(slices[0].pct).toBeCloseTo(0.3, 10);
		expect(slices[1].pct).toBeCloseTo(0.7, 10);
	});

	it('accumulates offsets so each slice starts where the previous one ended', () => {
		const input: DonutSliceInput[] = [
			{ label: 'a', value: 25, color: '#000' },
			{ label: 'b', value: 25, color: '#000' },
			{ label: 'c', value: 50, color: '#000' },
		];
		const { slices } = computeDonutSlices(input, RADIUS);
		expect(slices[0].offset).toBe(0);
		expect(slices[1].offset).toBeCloseTo(slices[0].dash, 10);
		expect(slices[2].offset).toBeCloseTo(slices[0].dash + slices[1].dash, 10);
	});

	it('dash lengths sum to the full circumference', () => {
		const input: DonutSliceInput[] = [
			{ label: 'a', value: 12, color: '#000' },
			{ label: 'b', value: 41, color: '#000' },
			{ label: 'c', value: 7, color: '#000' },
		];
		const { slices } = computeDonutSlices(input, RADIUS);
		const dashSum = slices.reduce((sum, s) => sum + s.dash, 0);
		expect(dashSum).toBeCloseTo(CIRCUMFERENCE, 8);
	});

	it('drops zero and negative-value slices instead of drawing a zero-length arc', () => {
		const input: DonutSliceInput[] = [
			{ label: 'a', value: 40, color: '#000' },
			{ label: 'zero', value: 0, color: '#000' },
			{ label: 'negative', value: -5, color: '#000' },
			{ label: 'b', value: 60, color: '#000' },
		];
		const { slices } = computeDonutSlices(input, RADIUS);
		expect(slices.map(s => s.label)).toEqual(['a', 'b']);
	});

	it('returns an empty result when every value is zero or the list is empty', () => {
		expect(computeDonutSlices([], RADIUS)).toEqual({ slices: [], total: 0 });
		expect(computeDonutSlices([{ label: 'a', value: 0, color: '#000' }], RADIUS)).toEqual({
			slices: [], total: 0,
		});
	});

	it('carries extra fields on the input through to the computed slice', () => {
		const input = [
			{ label: 'a', value: 10, color: '#000', supplierName: 'Frutas Gómez' },
		];
		const { slices } = computeDonutSlices(input, RADIUS);
		expect(slices[0].supplierName).toBe('Frutas Gómez');
		expect(slices[0].pct).toBe(1);
	});
});

describe('donutSeparatorAngleRad / donutSeparatorPoint', () => {
	it('places the first slice boundary at angle 0 (3 o\'clock, pre-rotation)', () => {
		const circumference = 2 * Math.PI * 70;
		const angle = donutSeparatorAngleRad(0, circumference);
		expect(angle).toBe(0);
		const point = donutSeparatorPoint(90, 90, 70, angle);
		expect(point.x).toBeCloseTo(160, 8);
		expect(point.y).toBeCloseTo(90, 8);
	});

	it('places a boundary at a quarter turn at the expected coordinates', () => {
		const circumference = 2 * Math.PI * 70;
		const angle = donutSeparatorAngleRad(circumference / 4, circumference);
		expect(angle).toBeCloseTo(Math.PI / 2, 10);
		const point = donutSeparatorPoint(90, 90, 70, angle);
		expect(point.x).toBeCloseTo(90, 8);
		expect(point.y).toBeCloseTo(160, 8);
	});

	it('returns angle 0 for a zero circumference instead of dividing by zero', () => {
		expect(donutSeparatorAngleRad(5, 0)).toBe(0);
	});
});
