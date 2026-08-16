/**
 * Exact decimal helpers for numeric(12,2) money columns (issue #477).
 *
 * These pin the cent-based parsing/formatting so money never round-trips
 * through naive float arithmetic that compounds rounding error across sums.
 */
import { describe, it, expect } from 'vitest';
import {
	toCents, fromCents, toMoneyString, sumCents, sumMoney, moneyEquals,
	moneyToNumber, moneyToNullableNumber,
} from '../src/lib/server/money';

describe('toCents', () => {
	it('parses a plain integer string', () => {
		expect(toCents('100')).toBe(10000);
	});

	it('parses a two-decimal string exactly', () => {
		expect(toCents('123.45')).toBe(12345);
	});

	it('parses a large invoice amount exactly (float4 could not hold this)', () => {
		expect(toCents('123456.78')).toBe(12345678);
	});

	it('parses a number input', () => {
		expect(toCents(18.5)).toBe(1850);
	});

	it('rounds half-up beyond two decimals', () => {
		expect(toCents('1.005')).toBe(101);
		expect(toCents('1.004')).toBe(100);
	});

	it('handles a comma decimal separator', () => {
		expect(toCents('18,50')).toBe(1850);
	});

	it('handles negative amounts', () => {
		expect(toCents('-45.00')).toBe(-4500);
	});

	it('returns null for null/undefined/blank input', () => {
		expect(toCents(null)).toBeNull();
		expect(toCents(undefined)).toBeNull();
		expect(toCents('')).toBeNull();
		expect(toCents('   ')).toBeNull();
	});

	it('returns null for non-numeric input', () => {
		expect(toCents('not a number')).toBeNull();
	});
});

describe('fromCents', () => {
	it('formats cents back to a numeric(12,2)-style string', () => {
		expect(fromCents(12345)).toBe('123.45');
	});

	it('pads sub-euro amounts with a leading zero', () => {
		expect(fromCents(5)).toBe('0.05');
	});

	it('formats negative cents', () => {
		expect(fromCents(-4500)).toBe('-45.00');
	});

	it('formats zero', () => {
		expect(fromCents(0)).toBe('0.00');
	});
});

describe('toCents / fromCents round-trip', () => {
	it('round-trips a large invoice amount exactly (€123,456.78)', () => {
		const cents = toCents('123456.78');
		expect(fromCents(cents!)).toBe('123456.78');
	});

	it('round-trips values above what float4 (real) can represent precisely', () => {
		// float4 has ~6-7 significant decimal digits; this has 9.
		const amount = '1234567.89';
		expect(fromCents(toCents(amount)!)).toBe(amount);
	});
});

describe('toMoneyString', () => {
	it('canonicalises a whole-number string to two decimals', () => {
		expect(toMoneyString('100')).toBe('100.00');
	});

	it('canonicalises a float input', () => {
		expect(toMoneyString(18.5)).toBe('18.50');
	});

	it('returns null for missing input', () => {
		expect(toMoneyString(null)).toBeNull();
		expect(toMoneyString(undefined)).toBeNull();
	});
});

describe('sumCents / sumMoney — exact aggregation', () => {
	it('sums many line items to an exact expected total', () => {
		// Chosen so naive float addition would drift from the exact total.
		const lineTotals = ['0.10', '0.20', '0.10', '19.99', '4.99', '0.01', '100.00'];
		expect(sumCents(lineTotals)).toBe(12539);
		expect(sumMoney(lineTotals)).toBe('125.39');
	});

	it('matches an exact expected total over a large number of line items', () => {
		const lineTotals = Array.from({ length: 1000 }, () => '0.01');
		expect(sumCents(lineTotals)).toBe(1000);
		expect(sumMoney(lineTotals)).toBe('10.00');
	});

	it('treats null/invalid entries as zero', () => {
		expect(sumCents(['10.00', null, undefined, '5.50'])).toBe(1550);
	});

	it('sums to exactly zero for an empty list', () => {
		expect(sumMoney([])).toBe('0.00');
	});
});

describe('moneyEquals', () => {
	it('treats differently-formatted equal amounts as equal', () => {
		expect(moneyEquals('5', '5.00')).toBe(true);
		expect(moneyEquals('5.00', 5)).toBe(true);
	});

	it('distinguishes amounts a cent apart', () => {
		expect(moneyEquals('5.00', '5.01')).toBe(false);
	});
});

describe('moneyToNumber / moneyToNullableNumber', () => {
	it('converts an exact decimal string to a JS number for display', () => {
		expect(moneyToNumber('123.45')).toBeCloseTo(123.45, 10);
	});

	it('coerces a missing amount to 0', () => {
		expect(moneyToNumber(null)).toBe(0);
	});

	it('preserves null instead of coercing to 0', () => {
		expect(moneyToNullableNumber(null)).toBeNull();
		expect(moneyToNullableNumber('0.00')).toBe(0);
	});
});
