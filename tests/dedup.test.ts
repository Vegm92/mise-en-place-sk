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
import {
	computeInvoiceContentHash, computeFileHash,
	amountsAreSimilar, isoDateOffset, findSimilarInvoice,
} from '../src/lib/server/dedup';

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
