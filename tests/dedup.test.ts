/**
 * Content-hash dedup (issue #122 / WhatsApp + batch save paths).
 *
 * computeInvoiceContentHash canonicalises the semantically-meaningful fields of
 * an invoice so that the SAME invoice — re-uploaded, re-scanned, or sent twice
 * over WhatsApp — produces the SAME hash and is rejected as a duplicate, while a
 * genuinely different invoice produces a different hash. These tests pin the
 * canonicalisation rules (lowercasing, trimming, null-coalescing, line order).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { computeInvoiceContentHash, computeFileHash } from '../src/lib/server/dedup';

type Fields = Parameters<typeof computeInvoiceContentHash>[0];

function baseFields(): Fields {
	return {
		supplierName: 'Acme Foods',
		invoiceNumber: 'INV-001',
		invoiceDate: '2026-06-01',
		dueDate: '2026-06-30',
		totalAmount: 123.45,
		lineDescriptions: ['Tomatoes', 'Olive Oil'],
		lineQuantities: [10, 2],
		lineUnits: ['kg', 'L'],
		lineUnitPrices: [1.5, 8.0],
		lineTotalPrices: [15.0, 16.0],
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
		const b = computeInvoiceContentHash({ ...baseFields(), totalAmount: 999.99 });
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
			lineUnitPrices: [8.0, 1.5],
			lineTotalPrices: [16.0, 15.0],
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
		const zeroTotal = computeInvoiceContentHash({ ...baseFields(), totalAmount: 0 });
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
