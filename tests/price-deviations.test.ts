/**
 * src/lib/server/price-deviations.ts — the euro figure behind the dashboard's
 * price work cards and /reminders (ADR-039). Per line: reference = median of
 * the ≤3 previous prices from the same supplier on the same basis, deviation
 * = (paid − reference) / reference, overpaid € = line total × dev / (1 + dev)
 * (what the same quantity would have cost at the reference price). Groups
 * whose latest in-range deviation clears the threshold are reported with
 * their € overpaid over the range and the cheapest other supplier selling
 * the same product on the same basis.
 */
import { describe, it, expect } from 'vitest';
import {
	computePriceDeviations, comparablePrice, lineKey, overpaidOnLine, rankSupplierPrices, type DeviationLine,
} from '../src/lib/server/price-deviations';

function line(over: Partial<DeviationLine> & { invoiceDate: string; unitPrice: number; totalPrice: number }): DeviationLine {
	return {
		productId: 7, description: 'Merluza fresca', supplierId: 1, supplierName: 'Atlántico',
		unit: 'kg', normalizedUnitPrice: over.unitPrice, baseUnit: 'kg', ...over,
	};
}

const RANGE = ['2026-09-01', '2026-09-30'] as const;

describe('overpaidOnLine', () => {
	it('is the part of the line total above the reference price', () => {
		expect(overpaidOnLine(125, 0.25)).toBeCloseTo(25, 6);
		expect(overpaidOnLine(100, 0)).toBe(0);
		expect(overpaidOnLine(100, -0.2)).toBe(0);
		expect(overpaidOnLine(0, 0.5)).toBe(0);
	});
});

describe('comparablePrice / lineKey', () => {
	it('prefers the normalised price on its base unit, falls back to the unit price on the raw unit', () => {
		expect(comparablePrice({ unit: 'caja', unitPrice: 30, normalizedUnitPrice: 3, baseUnit: 'kg' })).toEqual({ price: 3, basis: 'kg' });
		expect(comparablePrice({ unit: 'Caja', unitPrice: 30, normalizedUnitPrice: null, baseUnit: null })).toEqual({ price: 30, basis: 'unit:caja' });
		expect(comparablePrice({ unit: null, unitPrice: null, normalizedUnitPrice: null, baseUnit: null })).toBeNull();
	});
	it('keys by product when linked, by the normalised description otherwise', () => {
		expect(lineKey({ productId: 7, description: 'x' })).toBe('p:7');
		expect(lineKey({ productId: null, description: 'Merluza Fresca' })).toBe(lineKey({ productId: null, description: 'merluza fresca' }));
	});
});

describe('computePriceDeviations', () => {
	it('reports a rise against the median of the previous three prices, with € overpaid over the range', () => {
		const lines = [
			line({ invoiceDate: '2026-07-01', unitPrice: 16, totalPrice: 160 }),
			line({ invoiceDate: '2026-07-15', unitPrice: 16, totalPrice: 160 }),
			line({ invoiceDate: '2026-08-01', unitPrice: 17, totalPrice: 170 }),
			line({ invoiceDate: '2026-09-03', unitPrice: 20, totalPrice: 200 }),
			line({ invoiceDate: '2026-09-17', unitPrice: 20, totalPrice: 100 }),
		];
		const [d] = computePriceDeviations(lines, ...RANGE);
		expect(d).toMatchObject({ key: 'p:7', supplierName: 'Atlántico', basis: 'kg', referencePrice: 17, latestPrice: 20, lineCount: 2, lastDate: '2026-09-17', alternative: null });
		expect(d!.deviationPct).toBeCloseTo(17.6, 1);
		expect(d!.extraPaid).toBeCloseTo(200 * (4 / 20) + 100 * (3 / 20), 6);
	});

	it('ignores groups under the threshold, without a reference, or outside the range', () => {
		const flat = [line({ invoiceDate: '2026-08-01', unitPrice: 16, totalPrice: 160 }), line({ invoiceDate: '2026-09-05', unitPrice: 17, totalPrice: 170 })];
		expect(computePriceDeviations(flat, ...RANGE)).toEqual([]);
		expect(computePriceDeviations(flat, '2026-09-01', '2026-09-30', 0.05)).toHaveLength(1);
		const noReference = [line({ invoiceDate: '2026-09-05', unitPrice: 30, totalPrice: 300 })];
		expect(computePriceDeviations(noReference, ...RANGE)).toEqual([]);
		const oldRise = [line({ invoiceDate: '2026-06-01', unitPrice: 10, totalPrice: 100 }), line({ invoiceDate: '2026-08-20', unitPrice: 20, totalPrice: 200 })];
		expect(computePriceDeviations(oldRise, ...RANGE)).toEqual([]);
	});

	it('names the cheapest other supplier on the same basis and the € it would have saved', () => {
		const lines = [
			line({ invoiceDate: '2026-08-01', unitPrice: 16, totalPrice: 160 }),
			line({ invoiceDate: '2026-09-10', unitPrice: 20, totalPrice: 200 }),
			line({ invoiceDate: '2026-08-20', unitPrice: 15, totalPrice: 150, supplierId: 2, supplierName: 'Mercavera' }),
			line({ invoiceDate: '2026-07-20', unitPrice: 14, totalPrice: 140, supplierId: 3, supplierName: 'Lonja' }),
			line({ invoiceDate: '2026-08-25', unitPrice: 10, totalPrice: 100, supplierId: 4, supplierName: 'Cajas SL', normalizedUnitPrice: null, baseUnit: null, unit: 'caja' }),
		];
		const [d] = computePriceDeviations(lines, ...RANGE);
		expect(d!.alternative).toMatchObject({ supplierName: 'Lonja', price: 14, basis: 'kg', asOf: '2026-07-20' });
		expect(d!.alternative!.savingsPct).toBeCloseTo(0.3, 6);
		expect(d!.alternative!.potentialSavings).toBeCloseTo(60, 6);
	});

	it('does not offer an alternative that is not cheaper or is too old', () => {
		const lines = [
			line({ invoiceDate: '2026-08-01', unitPrice: 16, totalPrice: 160 }),
			line({ invoiceDate: '2026-09-10', unitPrice: 20, totalPrice: 200 }),
			line({ invoiceDate: '2026-09-01', unitPrice: 21, totalPrice: 210, supplierId: 2, supplierName: 'Caro' }),
			line({ invoiceDate: '2025-12-01', unitPrice: 9, totalPrice: 90, supplierId: 3, supplierName: 'Antiguo' }),
		];
		expect(computePriceDeviations(lines, ...RANGE)[0]!.alternative).toBeNull();
	});

	it('orders by € overpaid, then by deviation', () => {
		const lines = [
			line({ invoiceDate: '2026-08-01', unitPrice: 10, totalPrice: 100 }),
			line({ invoiceDate: '2026-09-02', unitPrice: 12, totalPrice: 600 }),
			line({ invoiceDate: '2026-08-01', unitPrice: 10, totalPrice: 100, productId: 8, description: 'Tomate' }),
			line({ invoiceDate: '2026-09-02', unitPrice: 15, totalPrice: 30, productId: 8, description: 'Tomate' }),
		];
		expect(computePriceDeviations(lines, ...RANGE).map((d) => d.description)).toEqual(['Merluza fresca', 'Tomate']);
	});
});

describe('rankSupplierPrices', () => {
	it('keeps each supplier’s latest comparable price on the dominant basis, cheapest first', () => {
		const lines = [
			line({ invoiceDate: '2026-08-01', unitPrice: 16, totalPrice: 160 }),
			line({ invoiceDate: '2026-09-10', unitPrice: 20, totalPrice: 200 }),
			line({ invoiceDate: '2026-08-20', unitPrice: 15, totalPrice: 150, supplierId: 2, supplierName: 'Mercavera' }),
			line({ invoiceDate: '2026-08-25', unitPrice: 10, totalPrice: 100, supplierId: 4, supplierName: 'Cajas SL', normalizedUnitPrice: null, baseUnit: null, unit: 'caja' }),
		];
		expect(rankSupplierPrices(lines)).toEqual([
			{ supplierId: 2, supplierName: 'Mercavera', price: 15, basis: 'kg', asOf: '2026-08-20', vsCheapestPct: 0 },
			{ supplierId: 1, supplierName: 'Atlántico', price: 20, basis: 'kg', asOf: '2026-09-10', vsCheapestPct: 33.3 },
		]);
		expect(rankSupplierPrices([])).toEqual([]);
	});
});
