import { describe, it, expect } from 'vitest';
import {
	OLIVE_OIL,
	documentNumberFor,
	documentTypeFor,
	invoiceTotals,
	lineTotal,
	normalizeAliasKey,
	oliveOilPriceFor,
	supplierSku,
} from '../scripts/seed-demo-fixtures.mjs';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { detectTotalMismatch } from '../src/lib/tax';

describe('seed demo fixtures', () => {
	it('derives tax base, 10% VAT and total from the line totals', () => {
		const lines = [lineTotal(3, 4.5), lineTotal(7, 9.4), lineTotal(1, 13.5)];
		const totals = invoiceTotals(lines);
		expect(totals.taxBase).toBe('92.80');
		expect(totals.taxAmount).toBe('9.28');
		expect(totals.totalAmount).toBe('102.08');
		const bands = JSON.parse(totals.taxBreakdown);
		expect(bands).toEqual([{ rate: 0.1, base: 92.8, tax_amount: 9.28, type: 'iva' }]);
		expect(detectTotalMismatch(lines, bands, totals.totalAmount)).toBe(false);
	});

	it('only writes factura or albaran document types', () => {
		const types = new Set(Array.from({ length: 30 }, (_, i) => documentTypeFor(i)));
		expect([...types].sort()).toEqual(['albaran', 'factura']);
		expect(documentNumberFor(5)).toBe('ALB-2024-1005');
		expect(documentNumberFor(0)).toBe('F-2024-1000');
	});

	it('builds alias keys the app resolver would look up', () => {
		const description = `Aceite de oliva virgen extra ref. ${supplierSku(1, 25)}`;
		expect(normalizeAliasKey(description)).toBe(normalizeProductKey(description));
		expect(normalizeAliasKey('  Lácteos   Ref. A001 ')).toBe(normalizeProductKey('  Lácteos   Ref. A001 '));
	});

	it('gives olive oil a price rise above the 15% shock threshold on its latest invoice', () => {
		const latest = oliveOilPriceFor(OLIVE_OIL.supplierIndex);
		const previous = oliveOilPriceFor(OLIVE_OIL.supplierIndex + 8);
		expect(latest).not.toBeNull();
		expect(previous).not.toBeNull();
		expect((latest! - previous!) / previous!).toBeGreaterThan(0.15);
		expect(oliveOilPriceFor(0)).toBeNull();
	});
});
