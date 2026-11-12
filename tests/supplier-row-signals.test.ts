import { describe, it, expect } from 'vitest';
import { isNewSupplier, supplierSpendDeltaPct } from '../src/lib/supplier-row-signals';

describe('supplierSpendDeltaPct', () => {
	it('returns null when there is no spend yet this month', () => {
		expect(supplierSpendDeltaPct(0, 500)).toBeNull();
	});

	it('returns null when the previous month has no spend', () => {
		expect(supplierSpendDeltaPct(200, 0)).toBeNull();
		expect(supplierSpendDeltaPct(0, 0)).toBeNull();
	});

	it('returns the percentage change when both months have spend', () => {
		expect(supplierSpendDeltaPct(150, 100)).toBeCloseTo(50);
		expect(supplierSpendDeltaPct(60.5, 169)).toBeCloseTo(-64.2, 1);
	});

	it('returns null for non-finite inputs', () => {
		expect(supplierSpendDeltaPct(Number.NaN, 100)).toBeNull();
	});
});

describe('isNewSupplier', () => {
	const today = '2026-11-12';

	it('is false without any invoice', () => {
		expect(isNewSupplier(null, today)).toBe(false);
		expect(isNewSupplier(undefined, today)).toBe(false);
	});

	it('is true when the first invoice is within the last 30 days', () => {
		expect(isNewSupplier('2026-11-12', today)).toBe(true);
		expect(isNewSupplier('2026-10-13', today)).toBe(true);
		expect(isNewSupplier('2026-10-14', today)).toBe(true);
	});

	it('is false when the first invoice is older than 30 days', () => {
		expect(isNewSupplier('2026-10-12', today)).toBe(false);
		expect(isNewSupplier('2026-08-01', today)).toBe(false);
	});

	it('accepts Date values', () => {
		expect(isNewSupplier(new Date('2026-11-01T00:00:00Z'), today)).toBe(true);
		expect(isNewSupplier(new Date('2026-01-01T00:00:00Z'), today)).toBe(false);
	});
});
