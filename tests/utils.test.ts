import { describe, it, expect } from 'vitest';
import { fmt, truncate, fmtSize, str } from '../src/lib/formatters';
import {
	calcTotal,
	makeEmptyRow,
	initRows,
	addRow,
	removeRow,
	updateRow,
} from '../src/lib/invoice-items';

// --- formatters ---

describe('fmt', () => {
	it('formats a number to 2 decimal places', () => {
		expect(fmt(1.5)).toBe('1.50');
		expect(fmt(100)).toBe('100.00');
		expect(fmt(1.005)).toBe('1.00'); // floating-point floor, not banker's rounding
	});
	it('treats null and undefined as 0', () => {
		expect(fmt(null)).toBe('0.00');
		expect(fmt(undefined)).toBe('0.00');
	});
});

describe('truncate', () => {
	it('returns string unchanged when within length', () => {
		expect(truncate('hello', 10)).toBe('hello');
		expect(truncate('hello', 5)).toBe('hello');
	});
	it('truncates and appends ellipsis when over length', () => {
		expect(truncate('hello world', 5)).toBe('hello…');
	});
});

describe('fmtSize', () => {
	it('formats bytes', () => expect(fmtSize(500)).toBe('500 B'));
	it('formats kilobytes', () => expect(fmtSize(2048)).toBe('2,0 KB'));
	it('formats megabytes', () => expect(fmtSize(2 * 1024 * 1024)).toBe('2,0 MB'));
});

describe('str', () => {
	it('converts values to string', () => {
		expect(str(42)).toBe('42');
		expect(str('hello')).toBe('hello');
	});
	it('returns empty string for null and undefined', () => {
		expect(str(null)).toBe('');
		expect(str(undefined)).toBe('');
	});
});

// --- invoice-items ---

describe('calcTotal', () => {
	it('multiplies qty by price and rounds to 2 dp', () => {
		expect(calcTotal(5, 3.5)).toBe(17.5);
		expect(calcTotal('3', '1.334')).toBe(4.0); // 3 * 1.334 = 4.002 → rounds to 4.00
	});
	it('returns null when either value is missing or non-numeric', () => {
		expect(calcTotal(null, 10)).toBeNull();
		expect(calcTotal(5, null)).toBeNull();
		expect(calcTotal('', 10)).toBeNull();
		expect(calcTotal(5, 'abc')).toBeNull();
	});
});

describe('makeEmptyRow', () => {
	it('returns a row with all empty strings', () => {
		const row = makeEmptyRow();
		expect(row.description).toBe('');
		expect(row.quantity).toBe('');
		expect(row.unit).toBe('');
		expect(row.unit_price).toBe('');
	});
});

describe('initRows', () => {
	it('maps DB line items to Row[]', () => {
		const rows = initRows([
			{ description: 'Aceite', quantity: 5, unit: 'L', unit_price: 3.5 },
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0].quantity).toBe('5');
		expect(rows[0].unit_price).toBe('3.50');
	});
	it('returns a single empty row for empty input', () => {
		const rows = initRows([]);
		expect(rows).toHaveLength(1);
		expect(rows[0].description).toBe('');
	});
	it('handles null fields gracefully', () => {
		const rows = initRows([{ description: null, quantity: null, unit: null, unit_price: null }]);
		expect(rows[0].description).toBe('');
		expect(rows[0].quantity).toBe('');
	});
});

describe('addRow', () => {
	it('appends an empty row without mutating the original', () => {
		const original = [makeEmptyRow()];
		const next = addRow(original);
		expect(next).toHaveLength(2);
		expect(next).not.toBe(original);
	});
});

describe('removeRow', () => {
	it('removes the row at the given index', () => {
		const rows = [
			{ ...makeEmptyRow(), description: 'A' },
			{ ...makeEmptyRow(), description: 'B' },
			{ ...makeEmptyRow(), description: 'C' },
		];
		const next = removeRow(rows, 1);
		expect(next).toHaveLength(2);
		expect(next[0].description).toBe('A');
		expect(next[1].description).toBe('C');
	});
	it('does not mutate the original array', () => {
		const rows = [makeEmptyRow(), makeEmptyRow()];
		removeRow(rows, 0);
		expect(rows).toHaveLength(2);
	});
});

describe('updateRow', () => {
	it('applies a partial patch to the row at the given index', () => {
		const rows = [makeEmptyRow(), makeEmptyRow()];
		const next = updateRow(rows, 0, { quantity: '10', unit_price: '2.5' });
		expect(next[0].quantity).toBe('10');
		expect(next[0].unit_price).toBe('2.5');
		expect(next[1].quantity).toBe(''); // unchanged
	});
	it('does not mutate the original array', () => {
		const rows = [makeEmptyRow()];
		updateRow(rows, 0, { description: 'changed' });
		expect(rows[0].description).toBe('');
	});
});
