/**
 * Issue #508: `toFloat` (both the invoice-save write path and the extraction-
 * correction comparator) used `parseFloat`, which parses a leading numeric
 * prefix and silently ignores the rest — "12abc" → 12, "1e999" → Infinity,
 * and, critically for a Spanish-first app, "12,50" (a decimal comma) → 12
 * instead of 12.5.
 *
 * These tests pin the fix end to end: a single shared strict parser
 * (`parseAmount` / `toCents` in `$lib/money`, covered field-by-field in
 * `tests/money.test.ts`) now backs every monetary form field in both write
 * paths (`saveReviewedInvoice` for the batch/save flow, and the invoice edit
 * action), malformed input is rejected with a validation error and no write
 * instead of being silently coerced, a comma-decimal amount is persisted at
 * its correct value instead of truncated, and the content-hash path
 * (`computeFormContentHash`) can no longer diverge from what is actually
 * inserted for a comma-decimal amount (issue #494's follow-up concern).
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped
 * without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { saveReviewedInvoice, computeFormContentHash, findInvalidMonetaryField } from '../src/lib/server/invoice-save';
import { computeInvoiceContentHash } from '../src/lib/server/dedup';
import { createBatchStore } from '../src/lib/server/batch';
import type { BatchItem } from '../src/lib/server/batch';

let rid = '';
const USER_ID = 'user-508';
const SUPPLIER = '__inv_amount_sup__';

function fakeItem(): BatchItem {
	return {
		id: 'item-508',
		batchId: 'batch-508',
		restaurantId: rid,
		position: 0,
		fileKey: 'fake-508.pdf',
		displayName: 'fake-508.pdf',
		status: 'done',
		extractedData: { confidence: 1 },
		conversionNotes: null,
		extractError: null,
		queuedAt: null,
		source: 'web',
		sourceRef: null,
		jobCode: null,
		reviewStatus: null,
	};
}

function headerFields(fd: FormData, invoiceNumber: string, total: string): void {
	fd.append('supplier_name', SUPPLIER);
	fd.append('invoice_number', invoiceNumber);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', total);
	fd.append('low_confidence_ack', 'true');
}

function lineFields(fd: FormData, opts: { qty?: string; unitPrice?: string; totalPrice?: string; taxRate?: string }): void {
	fd.append('line_descriptions', 'Aceite Oliva 6x1L');
	fd.append('line_quantities', opts.qty ?? '2');
	fd.append('line_units', 'caja');
	fd.append('line_unit_prices', opts.unitPrice ?? '12.50');
	fd.append('line_total_prices', opts.totalPrice ?? '25.00');
	fd.append('line_tax_rates', opts.taxRate ?? '10');
	fd.append('line_supplier_skus', 'SKU-508');
}

function saveForm(invoiceNumber: string, total: string, lineOpts: Parameters<typeof lineFields>[1] = {}): FormData {
	const fd = new FormData();
	headerFields(fd, invoiceNumber, total);
	lineFields(fd, lineOpts);
	return fd;
}

async function invoiceCountFor(invoiceNumber: string): Promise<number> {
	const rows = await testSql`SELECT id FROM invoices WHERE invoice_number = ${invoiceNumber}`;
	return rows.length;
}

async function invoiceLineRow(invoiceId: number): Promise<{ unit_price: string; total_price: string; quantity: string; tax_rate: string }> {
	const [row] = await testSql`
		SELECT unit_price, total_price, quantity, tax_rate FROM invoice_line_items WHERE invoice_id = ${invoiceId}
	`;
	return row as { unit_price: string; total_price: string; quantity: string; tax_rate: string };
}

async function runEdit(invoiceId: number, formData: FormData) {
	const { actions } = await import('../src/routes/(app)/invoice/[id]/edit/+page.server');
	const event = {
		params: { id: String(invoiceId) },
		locals: { restaurantId: rid, user: { id: USER_ID } },
		request: { formData: async () => formData },
	} as never;
	return (actions.save as (e: never) => Promise<unknown>)(event).catch((e: unknown) => e);
}

async function invoiceRow(invoiceId: number): Promise<{ version: number; invoice_number: string; total_amount: string }> {
	const [row] = await testSql`
		SELECT version, invoice_number, total_amount FROM invoices WHERE id = ${invoiceId}
	`;
	return row as { version: number; invoice_number: string; total_amount: string };
}

async function runBatchSave(batchId: string, itemId: string, formData: FormData) {
	formData.append('itemId', itemId);
	const { actions } = await import('../src/routes/(app)/batch/[id]/+page.server');
	const event = {
		params: { id: batchId },
		locals: { restaurantId: rid },
		request: { formData: async () => formData },
	} as never;
	return (actions.save as (e: never) => Promise<unknown>)(event).catch((e: unknown) => e);
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-amount-508');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe('findInvalidMonetaryField (issue #508)', () => {
	it('flags a malformed total_amount', () => {
		expect(findInvalidMonetaryField(saveForm('X', '12abc'))).toBe('total_amount');
	});

	it('flags a malformed line_unit_prices entry only for a kept (non-blank-description) row', () => {
		const fd = saveForm('X', '25.00', { unitPrice: '1e999' });
		expect(findInvalidMonetaryField(fd)).toBe('line_unit_prices');

		const blankRowForm = new FormData();
		headerFields(blankRowForm, 'X', '25.00');
		blankRowForm.append('line_descriptions', '');
		blankRowForm.append('line_quantities', '1');
		blankRowForm.append('line_units', 'kg');
		blankRowForm.append('line_unit_prices', '0x10');
		blankRowForm.append('line_total_prices', '0x10');
		blankRowForm.append('line_tax_rates', '');
		expect(findInvalidMonetaryField(blankRowForm)).toBeNull();
	});

	it('does not flag a blank (optional) amount, or a valid comma-decimal amount', () => {
		expect(findInvalidMonetaryField(saveForm('X', ''))).toBeNull();
		expect(findInvalidMonetaryField(saveForm('X', '25.00', { unitPrice: '12,50' }))).toBeNull();
	});
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice — malformed amounts rejected, no write (issue #508)', () => {
	it('rejects a garbage-prefix total_amount and writes nothing', async () => {
		const out = await saveReviewedInvoice(fakeItem(), saveForm('INV-508-A', '12abc'), rid);
		expect(out).toEqual({ type: 'invalidAmount', field: 'total_amount' });
		expect(await invoiceCountFor('INV-508-A')).toBe(0);
	});

	it('rejects Infinity from scientific notation and writes nothing', async () => {
		const out = await saveReviewedInvoice(fakeItem(), saveForm('INV-508-B', '25.00', { unitPrice: '1e999' }), rid);
		expect(out).toEqual({ type: 'invalidAmount', field: 'line_unit_prices' });
		expect(await invoiceCountFor('INV-508-B')).toBe(0);
	});

	it('rejects a hex literal and writes nothing', async () => {
		const out = await saveReviewedInvoice(fakeItem(), saveForm('INV-508-C', '25.00', { totalPrice: '0x10' }), rid);
		expect(out).toEqual({ type: 'invalidAmount', field: 'line_total_prices' });
		expect(await invoiceCountFor('INV-508-C')).toBe(0);
	});

	it('persists a Spanish decimal-comma amount at its correct value, not truncated to its integer prefix', async () => {
		const out = await saveReviewedInvoice(
			fakeItem(),
			saveForm('INV-508-D', '25,50', { qty: '2', unitPrice: '12,75', totalPrice: '25,50', taxRate: '10' }),
			rid,
		);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const invRow = await invoiceRow(out.invoiceId);
		expect(invRow.total_amount).toBe('25.50');

		const lineRow = await invoiceLineRow(out.invoiceId);
		expect(lineRow.unit_price).toBe('12.75');
		expect(lineRow.total_price).toBe('25.50');
	});
});

describe('computeFormContentHash / insert-path agreement for comma decimals (issue #494 follow-up)', () => {
	it('hashes a comma-decimal unit price identically to its equivalent period-decimal form', () => {
		const header = { supplierName: 'Test', invoiceNumber: 'X', invoiceDate: '2026-01-01', dueDate: null, totalAmount: '25.50' };

		const commaForm = new FormData();
		headerFields(commaForm, 'X', '25,50');
		lineFields(commaForm, { unitPrice: '12,75', totalPrice: '25,50' });

		const periodForm = new FormData();
		headerFields(periodForm, 'X', '25.50');
		lineFields(periodForm, { unitPrice: '12.75', totalPrice: '25.50' });

		expect(computeFormContentHash(header, commaForm)).toBe(computeFormContentHash(header, periodForm));
	});

	it.skipIf(!hasDbEnv)('the hash computed at save time equals the hash of what was actually inserted', async () => {
		const form = saveForm('INV-508-HASH', '25,50', { unitPrice: '12,75', totalPrice: '25,50' });
		const header = { supplierName: SUPPLIER, invoiceNumber: 'INV-508-HASH', invoiceDate: '2026-07-20', dueDate: null, totalAmount: '25.50' };
		const expectedHash = computeFormContentHash(header, form);

		const out = await saveReviewedInvoice(fakeItem(), form, rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [row] = await testSql`SELECT content_hash FROM invoices WHERE id = ${out.invoiceId}`;
		expect((row as { content_hash: string }).content_hash).toBe(expectedHash);

		const actualHash = computeInvoiceContentHash({
			...header,
			lineDescriptions: ['Aceite Oliva 6x1L'],
			lineQuantities: [2],
			lineUnits: ['caja'],
			lineUnitPrices: ['12.75'],
			lineTotalPrices: ['25.50'],
			lineTaxRates: [10],
			taxBands: null,
		});
		expect((row as { content_hash: string }).content_hash).toBe(actualHash);
	});
});

describe.skipIf(!hasDbEnv)('invoice edit action — malformed amounts rejected, no write (issue #508)', () => {
	it('rejects a garbage-prefix total_amount with a validation error and makes no write', async () => {
		const created = await saveReviewedInvoice(fakeItem(), saveForm('INV-508-EDIT-A', '60.00'), rid);
		expect(created.type).toBe('saved');
		if (created.type !== 'saved') return;
		const before = await invoiceRow(created.invoiceId);

		const fd = new FormData();
		fd.append('supplier_name', SUPPLIER);
		fd.append('invoice_number', 'INV-508-EDIT-A-2');
		fd.append('invoice_date', '2026-07-20');
		fd.append('total_amount', '12abc');
		fd.append('version', String(before.version));
		lineFields(fd, {});

		const result = await runEdit(created.invoiceId, fd);
		expect(result).toMatchObject({ status: 400, data: { errorKey: 'error.invalidAmount' } });

		const after = await invoiceRow(created.invoiceId);
		expect(after.version).toBe(before.version);
		expect(after.invoice_number).toBe(before.invoice_number);
		expect(after.total_amount).toBe(before.total_amount);
	});

	it('persists a comma-decimal amount at its correct value on edit', async () => {
		const created = await saveReviewedInvoice(fakeItem(), saveForm('INV-508-EDIT-B', '60.00'), rid);
		expect(created.type).toBe('saved');
		if (created.type !== 'saved') return;
		const before = await invoiceRow(created.invoiceId);

		const fd = new FormData();
		fd.append('supplier_name', SUPPLIER);
		fd.append('invoice_number', 'INV-508-EDIT-B-2');
		fd.append('invoice_date', '2026-07-20');
		fd.append('total_amount', '99,90');
		fd.append('version', String(before.version));
		lineFields(fd, { unitPrice: '49,95', totalPrice: '99,90' });

		const result = await runEdit(created.invoiceId, fd);
		expect(isRedirect(result)).toBe(true);

		const after = await invoiceRow(created.invoiceId);
		expect(after.total_amount).toBe('99.90');

		const lineRow = await invoiceLineRow(created.invoiceId);
		expect(lineRow.unit_price).toBe('49.95');
		expect(lineRow.total_price).toBe('99.90');
	});
});

describe.skipIf(!hasDbEnv)('batch route save action — malformed amount wiring (issue #508)', () => {
	it('maps an invalidAmount outcome to a 400 with errorKey error.invalidAmount', async () => {
		const store = createBatchStore(testDb);
		const { batchId, itemIds: [itemId] } = await store.createBatch(rid, [{ key: 'ns/508.pdf', name: '508.pdf' }]);

		const result = await runBatchSave(batchId, itemId, saveForm('INV-508-BATCH', '12abc'));
		expect(result).toMatchObject({ status: 400, data: { errorKey: 'error.invalidAmount' } });
		expect(await invoiceCountFor('INV-508-BATCH')).toBe(0);
	});
});
