import { describe, it, expect } from 'vitest';
import {
	normalizeLine, fillMissingLineRates, docTypeStr, net30Suggestion, bandRowsFrom, priceStr,
	type LineItem, type ProductMatch,
} from '../src/lib/batch-form';

describe('priceStr', () => {
	it('formats a numeric value to two decimals', () => {
		expect(priceStr(12.5)).toBe('12.50');
	});
	it('parses a numeric string to two decimals', () => {
		expect(priceStr('12.5')).toBe('12.50');
	});
	it('falls back to the raw string when unparseable', () => {
		expect(priceStr('n/a')).toBe('n/a');
	});
	it('handles null and undefined', () => {
		expect(priceStr(null)).toBe('');
		expect(priceStr(undefined)).toBe('');
	});
});

describe('docTypeStr', () => {
	it.each([
		['factura', 'factura'],
		['albaran', 'albaran'],
		['ticket', ''],
		[undefined, ''],
		[null, ''],
	])('maps %s to %s', (input, expected) => {
		expect(docTypeStr(input)).toBe(expected);
	});
});

describe('net30Suggestion', () => {
	it('leaves an existing due date untouched', () => {
		expect(net30Suggestion('2026-05-01', '2026-04-01')).toBe('2026-05-01');
	});
	it('leaves the due date blank when the invoice date is not ISO', () => {
		expect(net30Suggestion('', 'not-a-date')).toBe('');
	});
	it('suggests invoice date + 30 days when due date is blank', () => {
		expect(net30Suggestion('', '2026-01-01')).toBe('2026-01-31');
	});
	it('rolls over a month boundary', () => {
		expect(net30Suggestion('', '2026-01-15')).toBe('2026-02-14');
	});
});

describe('bandRowsFrom', () => {
	it('returns an empty array for non-array input', () => {
		expect(bandRowsFrom(null)).toEqual([]);
		expect(bandRowsFrom(undefined)).toEqual([]);
		expect(bandRowsFrom({})).toEqual([]);
	});
	it('maps a raw tax breakdown into band rows', () => {
		const raw = [{ rate: 0.21, type: 'iva', base: 100, tax_amount: 21 }];
		expect(bandRowsFrom(raw)).toEqual([
			{ rate: '21', type: 'iva', base: '100.00', amount: '21.00' },
		]);
	});
	it('blanks an unrecognised tax type', () => {
		const raw = [{ rate: 0.1, type: 'bogus', base: 50, tax_amount: 5 }];
		expect(bandRowsFrom(raw)[0]?.type).toBe('');
	});
});

describe('normalizeLine', () => {
	const match: ProductMatch = {
		description: 'x', productId: 1, productName: 'Tomatoes',
		status: 'exact', score: 0.9, suggestedTaxRate: 0.1,
	};

	it('adopts the matched product name for a resolved match', () => {
		const line: LineItem = { description: 'tomate', quantity: 2, unit_price: 1, total_price: 2, tax_rate: 0.1 };
		expect(normalizeLine(line, match).product_name).toBe('Tomatoes');
	});
	it('blanks the product name for a new or pending match', () => {
		const pending: ProductMatch = { ...match, status: 'pending' };
		const line: LineItem = {};
		expect(normalizeLine(line, pending).product_name).toBe('');
	});
	it('stringifies numeric fields for form inputs', () => {
		const line: LineItem = { quantity: 2, unit_price: 1.5, total_price: 3, tax_rate: 0.21 };
		const normalized = normalizeLine(line);
		expect(normalized.quantity).toBe('2');
		expect(normalized.unit_price).toBe('1.50');
		expect(normalized.total_price).toBe('3.00');
		expect(normalized.tax_rate).toBe('21');
	});
});

describe('fillMissingLineRates', () => {
	it.each([
		['10', 0.21, '10'],
		['', 0.21, '21'],
		['', null, ''],
	])('tax_rate %j with a suggested rate of %j becomes %j', (taxRate, suggestedTaxRate, expected) => {
		const items: LineItem[] = [{ tax_rate: taxRate }];
		const matches: ProductMatch[] = [
			{ description: '', productId: null, productName: '', status: 'new', score: null, suggestedTaxRate },
		];
		expect(fillMissingLineRates(items, matches)[0]?.tax_rate).toBe(expected);
	});
});
