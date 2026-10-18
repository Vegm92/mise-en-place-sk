/**
 * src/lib/savings-calculator.ts — the arithmetic behind the landing's
 * "what is at stake" calculator and the hero headline.
 *
 * The calculator is the one place the landing shows the visitor a euro figure
 * about their own business, so its maths has to be boringly correct: monthly
 * purchases × the drift scenario the visitor picked, ×12 for the year, and the
 * plan price as a share of the monthly figure. Inputs come from a free-text
 * field, so parsing is pinned for the shapes a Spanish or English visitor
 * actually types ("20.000", "20,000", "20.000,50 €", junk, empty).
 */
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_DRIFT,
	DEFAULT_MONTHLY_SPEND,
	DRIFT_PRESETS,
	MAX_MONTHLY_SPEND,
	formatPct,
	formatSpendInput,
	parseMonthlySpend,
	planShareOfStake,
	stakeAt,
} from '../src/lib/savings-calculator';

describe('parseMonthlySpend', () => {
	it.each([
		['20000', 20000],
		['20.000', 20000],
		['20,000', 20000],
		['20 000 €', 20000],
		['20.000,50 €', 20000],
		['20000.75', 20000],
		['1.250.000', 1250000],
		['  35.000  ', 35000],
	])('reads %j as %d whole euros', (raw, expected) => {
		expect(parseMonthlySpend(raw)).toBe(expected);
	});

	it.each(['', '   ', 'abc', '€', '-'])('reads %j as 0', (raw) => {
		expect(parseMonthlySpend(raw)).toBe(0);
	});

	it('ignores a minus sign rather than producing a negative spend', () => {
		expect(parseMonthlySpend('-5000')).toBe(5000);
	});

	it('caps absurd inputs so the output stays a finite, formattable number', () => {
		expect(parseMonthlySpend('9'.repeat(30))).toBe(MAX_MONTHLY_SPEND);
	});

	it('round-trips the formatted default in both locales', () => {
		for (const loc of ['es', 'en'] as const) {
			expect(parseMonthlySpend(formatSpendInput(DEFAULT_MONTHLY_SPEND, loc))).toBe(DEFAULT_MONTHLY_SPEND);
		}
	});
});

describe('stakeAt', () => {
	it('is purchases × drift per month and ×12 per year', () => {
		expect(stakeAt(20000, 0.02)).toEqual({ monthly: 400, yearly: 4800 });
		expect(stakeAt(60000, 0.03)).toEqual({ monthly: 1800, yearly: 21600 });
	});

	it('is zero for empty, negative or non-finite inputs', () => {
		for (const [spend, drift] of [[0, 0.02], [-1000, 0.02], [20000, 0], [20000, -0.01], [Number.NaN, 0.02], [20000, Number.POSITIVE_INFINITY]]) {
			expect(stakeAt(spend!, drift!).monthly, `${spend}/${drift}`).toBe(0);
		}
	});

	it('the hero scenario is the calculator default, so the headline and the calculator agree', () => {
		expect(DRIFT_PRESETS).toContain(DEFAULT_DRIFT);
		expect(stakeAt(DEFAULT_MONTHLY_SPEND, DEFAULT_DRIFT).yearly).toBe(DEFAULT_MONTHLY_SPEND * DEFAULT_DRIFT * 12);
	});
});

describe('planShareOfStake', () => {
	it('is the plan price over the monthly stake', () => {
		expect(planShareOfStake(100, 400)).toBe(0.25);
		expect(planShareOfStake(600, 400)).toBe(1.5);
	});

	it('is null when there is nothing at stake, so the page shows a prompt instead of Infinity', () => {
		expect(planShareOfStake(100, 0)).toBeNull();
		expect(planShareOfStake(100, -5)).toBeNull();
		expect(planShareOfStake(Number.NaN, 400)).toBeNull();
	});
});

describe('formatPct', () => {
	it('formats the drift presets without decimals in each locale', () => {
		expect(formatPct(0.02, 'es').replace(/\s/g, ' ')).toBe('2 %');
		expect(formatPct(0.02, 'en')).toBe('2%');
	});

	it('keeps one decimal below 10 % and rounds above it', () => {
		expect(formatPct(0.029, 'es').replace(/\s/g, ' ')).toBe('2,9 %');
		expect(formatPct(0.3225, 'en')).toBe('32%');
	});
});
