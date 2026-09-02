/**
 * Pure unit tests for reconcileLineItems (issue #886) — line-item
 * reconciliation between a linked delivery note (albarán) and invoice
 * (factura). No DB mocks: every case builds ReconLine literals directly, so
 * this file carries no fixture duplication with the DB-backed suites.
 */
import { describe, it, expect } from 'vitest';
import { reconcileLineItems, type ReconLine } from '../src/lib/server/line-reconciliation';

function line(overrides: Partial<ReconLine> & { id: number | string }): ReconLine {
	return {
		description: 'Producto de prueba',
		productId: null,
		quantity: 1,
		unit: 'ud',
		unitPrice: 10,
		normalizedUnitPrice: null,
		baseQuantity: null,
		...overrides,
	};
}

describe('reconcileLineItems — matching and missing lines', () => {
	it('matches identical lines with no issues', () => {
		const a = [line({ id: 1, description: 'Tomate pera', quantity: 5, unit: 'kg', unitPrice: 2 })];
		const b = [line({ id: 2, description: 'Tomate pera', quantity: 5, unit: 'kg', unitPrice: 2 })];
		const result = reconcileLineItems(a, b);
		expect(result.matched).toBe(1);
		expect(result.missingInInvoice).toEqual([]);
		expect(result.missingInDeliveryNote).toEqual([]);
		expect(result.quantityMismatches).toEqual([]);
		expect(result.priceMismatches).toEqual([]);
		expect(result.unitMismatches).toEqual([]);
		expect(result.hasDocumentIssue).toBe(false);
	});

	it('flags a line present on the delivery note but missing from the invoice', () => {
		const a = [
			line({ id: 1, description: 'Aceite de oliva' }),
			line({ id: 2, description: 'Harina de trigo' }),
		];
		const b = [line({ id: 3, description: 'Aceite de oliva' })];
		const result = reconcileLineItems(a, b);
		expect(result.matched).toBe(1);
		expect(result.missingInInvoice).toEqual([a[1]]);
		expect(result.missingInDeliveryNote).toEqual([]);
		expect(result.hasDocumentIssue).toBe(true);
	});

	it('flags a line present on the invoice but missing from the delivery note', () => {
		const a = [line({ id: 1, description: 'Aceite de oliva' })];
		const b = [
			line({ id: 2, description: 'Aceite de oliva' }),
			line({ id: 3, description: 'Sal fina' }),
		];
		const result = reconcileLineItems(a, b);
		expect(result.matched).toBe(1);
		expect(result.missingInInvoice).toEqual([]);
		expect(result.missingInDeliveryNote).toEqual([b[1]]);
		expect(result.hasDocumentIssue).toBe(true);
	});

	it('prefers a productId match over a description match', () => {
		const a = [
			line({ id: 1, description: 'Genérico', productId: 10, quantity: 3 }),
			line({ id: 2, description: 'Genérico', productId: 20, quantity: 7 }),
		];
		const b = [
			line({ id: 3, description: 'Genérico', productId: 20, quantity: 7 }),
			line({ id: 4, description: 'Genérico', productId: 10, quantity: 3 }),
		];
		const result = reconcileLineItems(a, b);
		expect(result.matched).toBe(2);
		expect(result.quantityMismatches).toEqual([]);
		expect(result.hasDocumentIssue).toBe(false);
	});
});

describe('reconcileLineItems — quantity and unit verdicts', () => {
	it('flags a quantity mismatch when units agree but quantities differ beyond tolerance', () => {
		const a = [line({ id: 1, description: 'Tomate pera', quantity: 10, unit: 'kg' })];
		const b = [line({ id: 2, description: 'Tomate pera', quantity: 8, unit: 'kg' })];
		const result = reconcileLineItems(a, b);
		expect(result.quantityMismatches).toEqual([{ a: a[0], b: b[0] }]);
		expect(result.unitMismatches).toEqual([]);
		expect(result.hasDocumentIssue).toBe(true);
	});

	it('refuses to compare quantities across different units with no comparable base', () => {
		const a = [line({ id: 1, description: 'Aceite de oliva', quantity: 5, unit: 'caja', baseQuantity: null })];
		const b = [line({ id: 2, description: 'Aceite de oliva', quantity: 30, unit: 'L', baseQuantity: null })];
		const result = reconcileLineItems(a, b);
		expect(result.unitMismatches).toEqual([{ a: a[0], b: b[0] }]);
		expect(result.quantityMismatches).toEqual([]);
		expect(result.hasDocumentIssue).toBe(false);
	});

	it('compares base quantities when both sides carry a comparable base, even with different units', () => {
		const a = [line({ id: 1, description: 'Aceite de oliva', quantity: 5, unit: 'caja', baseQuantity: 30 })];
		const b = [line({ id: 2, description: 'Aceite de oliva', quantity: 24, unit: 'L', baseQuantity: 24 })];
		const result = reconcileLineItems(a, b);
		expect(result.unitMismatches).toEqual([]);
		expect(result.quantityMismatches).toEqual([{ a: a[0], b: b[0] }]);
		expect(result.hasDocumentIssue).toBe(true);
	});

	it.each<[string, number, number, boolean]>([
		['does not flag exactly at the 0.5% relative tolerance boundary', 100, 100.5, false],
		['flags just beyond the 0.5% relative tolerance boundary', 100, 100.51, true],
		['does not flag a small difference within the 0.01 absolute floor', 1, 1.005, false],
	])('%s', (_label, qa, qb, expectMismatch) => {
		const a = [line({ id: 1, description: 'Harina', quantity: qa, unit: 'kg' })];
		const b = [line({ id: 2, description: 'Harina', quantity: qb, unit: 'kg' })];
		const result = reconcileLineItems(a, b);
		expect(result.quantityMismatches).toEqual(expectMismatch ? [{ a: a[0], b: b[0] }] : []);
	});

	it('skips the quantity verdict when a quantity is missing on either side', () => {
		const a = [line({ id: 1, description: 'Sal', quantity: null, unit: 'ud' })];
		const b = [line({ id: 2, description: 'Sal', quantity: 5, unit: 'ud' })];
		const result = reconcileLineItems(a, b);
		expect(result.quantityMismatches).toEqual([]);
		expect(result.unitMismatches).toEqual([]);
	});
});

describe('reconcileLineItems — price verdicts', () => {
	it.each<[string, number, number, boolean]>([
		['flags a price mismatch beyond the 5% tolerance using normalized unit prices', 3.0, 3.5, true],
		['does not flag a price difference within the 5% tolerance', 3.0, 3.1, false],
	])('%s', (_label, pa, pb, expectMismatch) => {
		const a = [line({ id: 1, description: 'Aceite de oliva', unit: 'caja', normalizedUnitPrice: pa })];
		const b = [line({ id: 2, description: 'Aceite de oliva', unit: 'L', normalizedUnitPrice: pb })];
		const result = reconcileLineItems(a, b);
		expect(result.priceMismatches).toEqual(expectMismatch ? [{ a: a[0], b: b[0] }] : []);
	});

	it('falls back to raw unit prices with equal units when normalized prices are unavailable', () => {
		const a = [line({ id: 1, description: 'Sal fina', unit: 'kg', unitPrice: 1.0, normalizedUnitPrice: null })];
		const b = [line({ id: 2, description: 'Sal fina', unit: 'kg', unitPrice: 1.2, normalizedUnitPrice: null })];
		const result = reconcileLineItems(a, b);
		expect(result.priceMismatches).toEqual([{ a: a[0], b: b[0] }]);
	});

	it('cannot compare raw unit prices across different units with no normalized price', () => {
		const a = [line({ id: 1, description: 'Sal fina', unit: 'caja', unitPrice: 1.0, normalizedUnitPrice: null })];
		const b = [line({ id: 2, description: 'Sal fina', unit: 'kg', unitPrice: 5.0, normalizedUnitPrice: null })];
		const result = reconcileLineItems(a, b);
		expect(result.priceMismatches).toEqual([]);
	});

	it('does not count a price mismatch toward hasDocumentIssue on its own', () => {
		const a = [line({ id: 1, description: 'Aceite de oliva', normalizedUnitPrice: 3.0 })];
		const b = [line({ id: 2, description: 'Aceite de oliva', normalizedUnitPrice: 4.0 })];
		const result = reconcileLineItems(a, b);
		expect(result.priceMismatches).toHaveLength(1);
		expect(result.hasDocumentIssue).toBe(false);
	});
});
