import { describe, it, expect } from 'vitest';
import { calcTotal, initRows, makeEmptyRow } from '$lib/invoice-items';
import { toCents } from '$lib/money';

describe('calcTotal — unchanged behavior (RULE-001 characterization)', () => {
	it('multiplies numbers and rounds to cents', () => {
		expect(calcTotal(2, 5.5)).toBe(11);
		expect(calcTotal(3, 2.345)).toBe(7.04);
	});

	it('multiplies dot-decimal strings', () => {
		expect(calcTotal('2.5', '4')).toBe(10);
		expect(calcTotal('3', '2.34')).toBe(7.02);
	});

	it('returns null when either side is missing or not a number', () => {
		expect(calcTotal(null, 5)).toBeNull();
		expect(calcTotal(5, null)).toBeNull();
		expect(calcTotal('', '5')).toBeNull();
		expect(calcTotal('abc', '5')).toBeNull();
		expect(calcTotal('2', 'abc')).toBeNull();
	});

	it('allows negative lines (credit notes)', () => {
		expect(calcTotal('-2', '3')).toBe(-6);
	});

	it('seeds one empty row when there are no line items', () => {
		expect(initRows([])).toEqual([makeEmptyRow()]);
	});
});

describe('calcTotal — Spanish decimals (RULE-001, issue #1270)', () => {
	it('2 × "1,50" is 300 cents, not 200', () => {
		expect(toCents(calcTotal('2', '1,50'))).toBe(300);
	});

	it('reads a decimal comma in the quantity too', () => {
		expect(calcTotal('1,5', '2')).toBe(3);
		expect(calcTotal('0,5', '1,50')).toBe(0.75);
	});

	it('reads a Spanish thousands price', () => {
		expect(calcTotal('2', '1.234')).toBe(2468);
		expect(calcTotal('2', '1.234,56')).toBe(2469.12);
	});

	it('keeps a three-decimal quantity as a decimal, not a thousands group', () => {
		expect(calcTotal('1.250', '4')).toBe(5);
		expect(calcTotal('1,250', '4')).toBe(5);
	});
});
