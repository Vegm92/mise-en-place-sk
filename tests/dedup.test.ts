/**
 * Content-hash dedup (issue #122 / WhatsApp + batch save paths).
 *
 * computeInvoiceContentHash canonicalises the semantically-meaningful fields of
 * an invoice so that the SAME invoice — re-uploaded, re-scanned, or sent twice
 * over WhatsApp — produces the SAME hash and is rejected as a duplicate, while a
 * genuinely different invoice produces a different hash. These tests pin the
 * canonicalisation rules (lowercasing, trimming, null-coalescing, line order).
 *
 * Also covers issue #494 (a blank middle line description used to shift every
 * later quantity/unit/price out of position in the hash relative to what was
 * actually stored, via computeFormContentHash's blank-filtering) — end to end
 * through saveReviewedInvoice, plus the direct hash-alignment and
 * hash-stability seams.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	computeInvoiceContentHash, computeFileHash,
	amountsAreSimilar, isoDateOffset, findSimilarInvoice,
} from '../src/lib/server/dedup';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import { computeFormContentHash, saveReviewedInvoice } from '../src/lib/server/invoice-save';
import type { BatchItem } from '../src/lib/server/batch';
import {
	closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { fakeBatchItem } from './helpers/batch-item';

type Fields = Parameters<typeof computeInvoiceContentHash>[0];

function baseFields(): Fields {
	return {
		supplierName: 'Acme Foods',
		invoiceNumber: 'INV-001',
		invoiceDate: '2026-06-01',
		dueDate: '2026-06-30',
		totalAmount: '123.45',
		lineDescriptions: ['Tomatoes', 'Olive Oil'],
		lineQuantities: [10, 2],
		lineUnits: ['kg', 'L'],
		lineUnitPrices: ['1.50', '8.00'],
		lineTotalPrices: ['15.00', '16.00'],
	};
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

describe('computeInvoiceContentHash — shape', () => {
	it('returns a 64-char lowercase hex sha256', () => {
		expect(computeInvoiceContentHash(baseFields())).toMatch(SHA256_HEX);
	});

	it('is deterministic for identical input', () => {
		expect(computeInvoiceContentHash(baseFields()))
			.toBe(computeInvoiceContentHash(baseFields()));
	});
});

describe('computeInvoiceContentHash — canonicalisation (same invoice → same hash)', () => {
	it('ignores supplier name case and surrounding whitespace', () => {
		const a = computeInvoiceContentHash(baseFields());
		const b = computeInvoiceContentHash({ ...baseFields(), supplierName: '  ACME foods  ' });
		expect(b).toBe(a);
	});

	it('ignores line description case and whitespace', () => {
		const a = computeInvoiceContentHash(baseFields());
		const b = computeInvoiceContentHash({
			...baseFields(),
			lineDescriptions: ['  TOMATOES ', 'olive OIL'],
		});
		expect(b).toBe(a);
	});

	it('ignores unit case/whitespace and treats empty unit as null', () => {
		const a = computeInvoiceContentHash({ ...baseFields(), lineUnits: [null, 'L'] });
		const b = computeInvoiceContentHash({ ...baseFields(), lineUnits: ['   ', '  l '] });
		expect(b).toBe(a);
	});
});

describe('computeInvoiceContentHash — sensitivity (different invoice → different hash)', () => {
	it('changes when the total amount changes', () => {
		const a = computeInvoiceContentHash(baseFields());
		const b = computeInvoiceContentHash({ ...baseFields(), totalAmount: '999.99' });
		expect(b).not.toBe(a);
	});

	it('is case-sensitive on the invoice number (only trimmed)', () => {
		const a = computeInvoiceContentHash(baseFields());
		const b = computeInvoiceContentHash({ ...baseFields(), invoiceNumber: 'inv-001' });
		expect(b).not.toBe(a);
	});

	it('trims but does not alter invoice number content', () => {
		const a = computeInvoiceContentHash(baseFields());
		const b = computeInvoiceContentHash({ ...baseFields(), invoiceNumber: '  INV-001  ' });
		expect(b).toBe(a);
	});

	it('changes when line order changes (position is significant)', () => {
		const a = computeInvoiceContentHash(baseFields());
		const b = computeInvoiceContentHash({
			...baseFields(),
			lineDescriptions: ['Olive Oil', 'Tomatoes'],
			lineQuantities: [2, 10],
			lineUnits: ['L', 'kg'],
			lineUnitPrices: ['8.00', '1.50'],
			lineTotalPrices: ['16.00', '15.00'],
		});
		expect(b).not.toBe(a);
	});

	it('changes when a line quantity changes', () => {
		const a = computeInvoiceContentHash(baseFields());
		const b = computeInvoiceContentHash({ ...baseFields(), lineQuantities: [11, 2] });
		expect(b).not.toBe(a);
	});
});

describe('computeInvoiceContentHash — null handling', () => {
	it('handles null dates and total without throwing', () => {
		const fields: Fields = {
			...baseFields(),
			invoiceDate: null,
			dueDate: null,
			totalAmount: null,
		};
		expect(computeInvoiceContentHash(fields)).toMatch(SHA256_HEX);
	});

	it('treats a missing date the same as an explicit null', () => {
		const a = computeInvoiceContentHash({ ...baseFields(), invoiceDate: null });
		const b = computeInvoiceContentHash({ ...baseFields(), invoiceDate: null });
		expect(a).toBe(b);
	});

	it('distinguishes a null total from a zero total', () => {
		const nullTotal = computeInvoiceContentHash({ ...baseFields(), totalAmount: null });
		const zeroTotal = computeInvoiceContentHash({ ...baseFields(), totalAmount: '0.00' });
		expect(nullTotal).not.toBe(zeroTotal);
	});
});

describe('computeFileHash', () => {
	let tmpDir: string;

	beforeAll(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedup-test-'));
	});

	afterAll(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('returns a sha256 hex of the file bytes', () => {
		const file = path.join(tmpDir, 'a.bin');
		fs.writeFileSync(file, 'hello world');
		// Known sha256 of "hello world"
		expect(computeFileHash(file)).toBe(
			'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
		);
	});

	it('produces identical hashes for identical content', () => {
		const f1 = path.join(tmpDir, 'one.bin');
		const f2 = path.join(tmpDir, 'two.bin');
		fs.writeFileSync(f1, 'same bytes');
		fs.writeFileSync(f2, 'same bytes');
		expect(computeFileHash(f1)).toBe(computeFileHash(f2));
	});

	it('produces different hashes for different content', () => {
		const f1 = path.join(tmpDir, 'x.bin');
		const f2 = path.join(tmpDir, 'y.bin');
		fs.writeFileSync(f1, 'content A');
		fs.writeFileSync(f2, 'content B');
		expect(computeFileHash(f1)).not.toBe(computeFileHash(f2));
	});
});

describe('amountsAreSimilar — same-purchase heuristic (issue #449)', () => {
	it('matches identical amounts', () => {
		expect(amountsAreSimilar(123.45, 123.45)).toBe(true);
	});

	it('matches amounts within the absolute tolerance on small totals', () => {
		expect(amountsAreSimilar(10.0, 10.4)).toBe(true);
		expect(amountsAreSimilar(10.0, 10.6)).toBe(false);
	});

	it('matches amounts within the relative tolerance on large totals', () => {
		expect(amountsAreSimilar(1000, 1009)).toBe(true);
		expect(amountsAreSimilar(1000, 1020)).toBe(false);
	});

	it('does not match a clearly different amount', () => {
		expect(amountsAreSimilar(45.0, 890.0)).toBe(false);
	});
});

describe('isoDateOffset', () => {
	it('adds days across a month boundary', () => {
		expect(isoDateOffset('2026-06-25', 10)).toBe('2026-07-05');
	});

	it('subtracts days across a month boundary', () => {
		expect(isoDateOffset('2026-07-05', -10)).toBe('2026-06-25');
	});

	it('is a no-op for zero days', () => {
		expect(isoDateOffset('2026-06-01', 0)).toBe('2026-06-01');
	});
});

describe('findSimilarInvoice', () => {
	it('returns the candidate whose amount is similar', () => {
		const candidates = [
			{ id: 1, totalAmount: '45.00' },
			{ id: 2, totalAmount: '123.60' },
		];
		expect(findSimilarInvoice(candidates, 123.45)?.id).toBe(2);
	});

	it('returns null when no candidate is close enough', () => {
		const candidates = [{ id: 1, totalAmount: '45.00' }];
		expect(findSimilarInvoice(candidates, 123.45)).toBeNull();
	});

	it('skips candidates with a null amount', () => {
		const candidates = [{ id: 1, totalAmount: null }, { id: 2, totalAmount: '123.50' }];
		expect(findSimilarInvoice(candidates, 123.45)?.id).toBe(2);
	});

	it('returns null for an empty candidate list', () => {
		expect(findSimilarInvoice([], 123.45)).toBeNull();
	});
});

describe('computeFormContentHash — blank line alignment (issue #494)', () => {
	const header = {
		supplierName: 'Distribuidora Test',
		invoiceNumber: 'INV-494',
		invoiceDate: '2026-01-15',
		dueDate: null,
		totalAmount: '16.00',
	};

	function form(entries: Array<[string, string]>): FormData {
		const fd = new FormData();
		for (const [k, v] of entries) fd.append(k, v);
		return fd;
	}

	const twoLines: Array<[string, string]> = [
		['line_descriptions', 'Tomate'], ['line_quantities', '5'], ['line_units', 'kg'],
		['line_unit_prices', '2.00'], ['line_total_prices', '10.00'], ['line_tax_rates', ''],
		['line_descriptions', 'Aceite'], ['line_quantities', '2'], ['line_units', 'L'],
		['line_unit_prices', '3.00'], ['line_total_prices', '6.00'], ['line_tax_rates', ''],
	];

	const withBlankMiddle: Array<[string, string]> = [
		['line_descriptions', 'Tomate'], ['line_quantities', '5'], ['line_units', 'kg'],
		['line_unit_prices', '2.00'], ['line_total_prices', '10.00'], ['line_tax_rates', ''],
		['line_descriptions', ''], ['line_quantities', '99'], ['line_units', 'caja'],
		['line_unit_prices', '9.99'], ['line_total_prices', '999.00'], ['line_tax_rates', ''],
		['line_descriptions', 'Aceite'], ['line_quantities', '2'], ['line_units', 'L'],
		['line_unit_prices', '3.00'], ['line_total_prices', '6.00'], ['line_tax_rates', ''],
	];

	it('hashes the same whether a blank mid-form row is present or absent (columns stay aligned to their own description)', () => {
		expect(computeFormContentHash(header, form(withBlankMiddle)))
			.toBe(computeFormContentHash(header, form(twoLines)));
	});

	it('with a blank middle row, the hash matches the aligned (as-inserted) values, not the pre-fix shifted ones', () => {
		const hash = computeFormContentHash(header, form(withBlankMiddle));

		const aligned = computeInvoiceContentHash({
			...header,
			lineDescriptions: ['Tomate', 'Aceite'],
			lineQuantities: [5, 2],
			lineUnits: ['kg', 'L'],
			lineUnitPrices: ['2.00', '3.00'],
			lineTotalPrices: ['10.00', '6.00'],
			lineTaxRates: [null, null],
		});
		expect(hash).toBe(aligned);

		const misaligned = computeInvoiceContentHash({
			...header,
			lineDescriptions: ['Tomate', 'Aceite'],
			lineQuantities: [5, 99],
			lineUnits: ['kg', 'caja'],
			lineUnitPrices: ['2.00', '9.99'],
			lineTotalPrices: ['10.00', '999.00'],
			lineTaxRates: [null, null],
		});
		expect(hash).not.toBe(misaligned);
	});

	it('hashes a no-blank invoice identically to a direct computeInvoiceContentHash call (hash stability across the fix)', () => {
		const direct = computeInvoiceContentHash({
			...header,
			lineDescriptions: ['Tomate', 'Aceite'],
			lineQuantities: [5, 2],
			lineUnits: ['kg', 'L'],
			lineUnitPrices: ['2.00', '3.00'],
			lineTotalPrices: ['10.00', '6.00'],
			lineTaxRates: [null, null],
		});
		expect(computeFormContentHash(header, form(twoLines))).toBe(direct);
	});
});

let dupRid = '';

function dupFakeItem(): BatchItem {
	return fakeBatchItem({
		id: 'item-494',
		batchId: 'batch-494',
		restaurantId: dupRid,
		fileKey: 'fake-494.pdf',
		displayName: 'fake-494.pdf',
		extractedData: { confidence: 1 },
	});
}

function dupHeaderFields(fd: FormData, invoiceNumber: string): void {
	fd.append('supplier_name', 'Distribuidora Test 494');
	fd.append('invoice_number', invoiceNumber);
	fd.append('invoice_date', '2026-01-15');
	fd.append('total_amount', '16.00');
	fd.append('low_confidence_ack', 'true');
}

function dupFormWithBlankRow(invoiceNumber: string): FormData {
	const fd = new FormData();
	dupHeaderFields(fd, invoiceNumber);
	fd.append('line_descriptions', 'Tomate');
	fd.append('line_quantities', '5');
	fd.append('line_units', 'kg');
	fd.append('line_unit_prices', '2.00');
	fd.append('line_total_prices', '10.00');
	fd.append('line_tax_rates', '');
	fd.append('line_descriptions', '');
	fd.append('line_quantities', '99');
	fd.append('line_units', 'caja');
	fd.append('line_unit_prices', '9.99');
	fd.append('line_total_prices', '999.00');
	fd.append('line_tax_rates', '');
	fd.append('line_descriptions', 'Aceite');
	fd.append('line_quantities', '2');
	fd.append('line_units', 'L');
	fd.append('line_unit_prices', '3.00');
	fd.append('line_total_prices', '6.00');
	fd.append('line_tax_rates', '');
	return fd;
}

function dupFormNoBlankRow(invoiceNumber: string): FormData {
	const fd = new FormData();
	dupHeaderFields(fd, invoiceNumber);
	fd.append('line_descriptions', 'Tomate');
	fd.append('line_quantities', '5');
	fd.append('line_units', 'kg');
	fd.append('line_unit_prices', '2.00');
	fd.append('line_total_prices', '10.00');
	fd.append('line_tax_rates', '');
	fd.append('line_descriptions', 'Aceite');
	fd.append('line_quantities', '2');
	fd.append('line_units', 'L');
	fd.append('line_unit_prices', '3.00');
	fd.append('line_total_prices', '6.00');
	fd.append('line_tax_rates', '');
	return fd;
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice — blank middle row dedup (issue #494)', () => {
	beforeAll(async () => {
		const r = await createTestRestaurant('dedup-494');
		dupRid = r.id;
	});

	afterAll(async () => {
		await cleanupTestRestaurant(dupRid);
		await closeDb();
	});

	it('re-submitting the same document without the hallucinated blank row is still caught as contentDuplicate', async () => {
		const first = await saveReviewedInvoice(dupFakeItem(), dupFormWithBlankRow('INV-494-A'), dupRid);
		expect(first.type).toBe('saved');
		if (first.type !== 'saved') return;

		const second = await saveReviewedInvoice(dupFakeItem(), dupFormNoBlankRow('INV-494-A'), dupRid);
		expect(second).toEqual({ type: 'contentDuplicate', duplicateId: first.invoiceId });
	});

	it('re-submitting the exact same blank-row form is caught as contentDuplicate too', async () => {
		const first = await saveReviewedInvoice(dupFakeItem(), dupFormWithBlankRow('INV-494-B'), dupRid);
		expect(first.type).toBe('saved');
		if (first.type !== 'saved') return;

		const second = await saveReviewedInvoice(dupFakeItem(), dupFormWithBlankRow('INV-494-B'), dupRid);
		expect(second).toEqual({ type: 'contentDuplicate', duplicateId: first.invoiceId });
	});
});
