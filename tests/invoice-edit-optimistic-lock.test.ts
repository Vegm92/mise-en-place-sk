/**
 * Issue #495: the invoice edit action's optimistic-locking guard was
 * bypassable by posting a non-numeric `version`. `Number('abc')` is NaN,
 * `Number.isFinite(NaN)` is false, and the version predicate collapsed to
 * `undefined` — which Drizzle's `and()` silently drops. The update then ran
 * with no version check at all, unconditionally overwriting whatever another
 * tab or user had just saved (issue #243's lost-update protection made
 * unreachable for that request).
 *
 * The fix validates `version` up front (must be a positive integer) and
 * rejects anything else with 400, so the predicate is always applied.
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
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';

let rid = '';
const USER_ID = 'user-495';
const SUPPLIER = '__inv_lock_sup__';

function lineForm(fields: Record<string, string>, total: string): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.append(k, v);
	fd.append('supplier_name', SUPPLIER);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', total);
	fd.append('line_descriptions', 'Aceite Oliva 6x1L');
	fd.append('line_quantities', '2');
	fd.append('line_units', 'caja');
	fd.append('line_unit_prices', '30.00');
	fd.append('line_total_prices', total);
	fd.append('line_tax_rates', '10');
	fd.append('line_supplier_skus', 'SKU-495');
	return fd;
}

function editForm(number: string, total: string, version: string): FormData {
	return lineForm({ invoice_number: number, version }, total);
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

async function createInvoice(tag: string, total: string): Promise<number> {
	const out = await saveReviewedInvoice(
		null,
		lineForm({ invoice_number: `INV-495-${tag}`, low_confidence_ack: 'true' }, total),
		rid
	);
	expect(out.type).toBe('saved');
	return (out as { invoiceId: number }).invoiceId;
}

async function invoiceRow(invoiceId: number): Promise<{ version: number; invoice_number: string; total_amount: string }> {
	const [row] = await testSql`
		SELECT version, invoice_number, total_amount FROM invoices WHERE id = ${invoiceId}
	`;
	return row as { version: number; invoice_number: string; total_amount: string };
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-lock');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('invoice edit optimistic locking (issue #495)', () => {
	it('rejects a non-numeric version with 400 and makes no write', async () => {
		const invoiceId = await createInvoice('a', '60.00');
		const before = await invoiceRow(invoiceId);

		const result = await runEdit(invoiceId, editForm('INV-495-a-EDIT', '99.00', 'abc'));

		expect(result).toMatchObject({ status: 400, data: { errorKey: 'error.invalidVersion' } });
		const after = await invoiceRow(invoiceId);
		expect(after.version).toBe(before.version);
		expect(after.invoice_number).toBe(before.invoice_number);
		expect(after.total_amount).toBe(before.total_amount);
	});

	it('rejects version=0 and negative versions with 400', async () => {
		const invoiceId = await createInvoice('b', '60.00');

		const zero = await runEdit(invoiceId, editForm('INV-495-b-EDIT', '99.00', '0'));
		expect(zero).toMatchObject({ status: 400, data: { errorKey: 'error.invalidVersion' } });

		const negative = await runEdit(invoiceId, editForm('INV-495-b-EDIT', '99.00', '-1'));
		expect(negative).toMatchObject({ status: 400, data: { errorKey: 'error.invalidVersion' } });

		const nonInteger = await runEdit(invoiceId, editForm('INV-495-b-EDIT', '99.00', '1.5'));
		expect(nonInteger).toMatchObject({ status: 400, data: { errorKey: 'error.invalidVersion' } });
	});

	it('still rejects a stale (but numeric) version with the existing conflict response', async () => {
		const invoiceId = await createInvoice('c', '60.00');
		const before = await invoiceRow(invoiceId);

		const result = await runEdit(invoiceId, editForm('INV-495-c-EDIT', '99.00', '999'));

		expect(result).toMatchObject({
			status: 409,
			data: { error: 'This invoice was changed elsewhere (another tab or user). Reload the page before saving.' },
		});
		const after = await invoiceRow(invoiceId);
		expect(after.version).toBe(before.version);
		expect(after.invoice_number).toBe(before.invoice_number);
	});

	it('saves and bumps the version when the correct version is posted', async () => {
		const invoiceId = await createInvoice('d', '60.00');
		const before = await invoiceRow(invoiceId);

		const result = await runEdit(invoiceId, editForm('INV-495-d-EDIT', '99.00', String(before.version)));

		expect(isRedirect(result)).toBe(true);
		const after = await invoiceRow(invoiceId);
		expect(after.version).toBe(before.version + 1);
		expect(after.invoice_number).toBe('INV-495-d-EDIT');
	});
});
