import { describe, it, expect } from 'vitest';
import {
	OLIVE_OIL,
	defaultCategoryRows,
	documentNumberFor,
	dueDateOffsetFor,
	documentTypeFor,
	invoiceTotals,
	lineTotal,
	normalizeAliasKey,
	oliveOilPriceFor,
	supplierSku,
} from '../scripts/seed-demo-fixtures.mjs';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { detectTotalMismatch } from '../src/lib/tax';
import { seedDefaultCategories } from '../src/lib/server/categories';
import type { BatchDb } from '../src/lib/server/batch';

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

	it('seeds the same default category rows the app seeds for a new tenant', async () => {
		let inserted: unknown[] = [];
		const exec = {
			insert: () => ({
				values: (rows: unknown[]) => {
					inserted = rows;
					return { onConflictDoNothing: async () => undefined };
				},
			}),
		} as unknown as BatchDb;
		await seedDefaultCategories('rid-1', exec);
		const seeded = defaultCategoryRows('rid-1').map((r) => ({
			restaurantId: r.restaurant_id,
			name: r.name,
			nameKey: r.name_key,
			slug: r.slug,
			sortOrder: r.sort_order,
			isDefault: r.is_default,
		}));
		expect(seeded.length).toBeGreaterThan(0);
		expect(seeded).toEqual(inserted);
	});

	it('always puts the due date after the invoice date', () => {
		for (let i = 0; i < 30; i++) expect(dueDateOffsetFor(i)).toBeGreaterThan(0);
	});
});
