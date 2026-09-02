/**
 * Year-over-year price pairing (issue #884). Pure math: given each year's
 * latest purchase row for a product, pair it with the previous calendar
 * year and compute the % change — preferring `normalizedUnitPrice`
 * (ADR-009, €/base unit) and only falling back to the raw `unitPrice` when
 * both years lack a normalized price and share the same unit.
 */
import { describe, it, expect } from 'vitest';
import { pairYearlyPrices, yoyChangeForYear, type YearlyPriceInput, type YearlyPricePoint } from '../src/lib/price-yoy';

const row = (year: number, unitPrice: number | null, normalizedUnitPrice: number | null, unit: string | null): YearlyPriceInput => ({
	year, unitPrice, normalizedUnitPrice, unit,
});

type PairCase = [label: string, prev: YearlyPriceInput, cur: YearlyPriceInput, expected: Omit<YearlyPricePoint, 'year'>];

const PAIR_CASES: PairCase[] = [
	['a decrease produces a negative % change',
		row(2024, 10, 10, 'kg'), row(2025, 8, 8, 'kg'),
		{ price: 8, prevPrice: 10, changePct: -20 }],
	['a gap year (missing previous year) leaves the change null',
		row(2022, 5, 5, 'kg'), row(2025, 10, 10, 'kg'),
		{ price: 10, prevPrice: null, changePct: null }],
	['a zero previous price does not divide by zero',
		row(2024, 0, 0, 'kg'), row(2025, 10, 10, 'kg'),
		{ price: 10, prevPrice: 0, changePct: null }],
	['mixed units with no normalized price on either year leave the change null',
		row(2024, 5, null, 'caja'), row(2025, 10, null, 'kg'),
		{ price: 10, prevPrice: null, changePct: null }],
	['one year normalized and the other not never compares across the two',
		row(2024, 5, null, 'kg'), row(2025, 10, 10, 'kg'),
		{ price: 10, prevPrice: null, changePct: null }],
	['falls back to the raw unit price when both years lack a normalized price but share the same unit',
		row(2024, 5, null, 'kg'), row(2025, 6, null, 'kg'),
		{ price: 6, prevPrice: 5, changePct: 20 }],
];

describe('pairYearlyPrices — year N vs N-1', () => {
	it('a single year has no previous price and no change', () => {
		const points = pairYearlyPrices([row(2025, 10, 10, 'kg')]);
		expect(points).toEqual([{ year: 2025, price: 10, prevPrice: null, changePct: null }]);
	});

	it('two consecutive years with normalized prices compute the % change', () => {
		const points = pairYearlyPrices([row(2024, 8, 8, 'kg'), row(2025, 10, 10, 'kg')]);
		expect(points).toEqual([
			{ year: 2024, price: 8, prevPrice: null, changePct: null },
			{ year: 2025, price: 10, prevPrice: 8, changePct: 25 },
		]);
	});

	it.each(PAIR_CASES)('%s', (_label, prev, cur, expected) => {
		const points = pairYearlyPrices([prev, cur]);
		expect(points.find(p => p.year === cur.year)).toEqual({ year: cur.year, ...expected });
	});

	it('sorts by year regardless of input order', () => {
		const points = pairYearlyPrices([row(2025, 10, 10, 'kg'), row(2023, 8, 8, 'kg'), row(2024, 9, 9, 'kg')]);
		expect(points.map(p => p.year)).toEqual([2023, 2024, 2025]);
	});
});

describe('yoyChangeForYear', () => {
	it('returns the change for the requested year', () => {
		const rows = [row(2024, 8, 8, 'kg'), row(2025, 10, 10, 'kg')];
		expect(yoyChangeForYear(rows, 2025)).toBe(25);
	});

	it('returns null when the year is not present at all', () => {
		const rows = [row(2024, 8, 8, 'kg')];
		expect(yoyChangeForYear(rows, 2026)).toBeNull();
	});
});
