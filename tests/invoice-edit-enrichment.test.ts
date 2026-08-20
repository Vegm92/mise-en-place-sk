/**
 * Issue #481: the invoice edit action delete-and-reinserts line items. It used
 * to reinsert only five columns, silently dropping product_id, tax_rate and the
 * whole pack/unit block, and it never recomputed invoices.content_hash.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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
const USER_ID = 'user-481';
const SUPPLIER = '__inv_edit_sup__';
const DESC = 'Aceite Oliva 6x1L';

function lineForm(fields: Record<string, string>, total: string): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.append(k, v);
	fd.append('supplier_name', SUPPLIER);
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', total);
	fd.append('line_descriptions', DESC);
	fd.append('line_quantities', '2');
	fd.append('line_units', 'caja');
	fd.append('line_unit_prices', '30.00');
	fd.append('line_total_prices', total);
	fd.append('line_tax_rates', '10');
	return fd;
}

async function runEdit(invoiceId: number, total: string) {
	const { actions } = await import('../src/routes/(app)/invoice/[id]/edit/+page.server');
	const event = {
		params: { id: String(invoiceId) },
		locals: { restaurantId: rid, user: { id: USER_ID } },
		request: { formData: async () => lineForm({ invoice_number: 'INV-481', version: '1' }, total) },
	} as never;
	return (actions.save as (e: never) => Promise<unknown>)(event).catch((e: unknown) => e);
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-edit');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('invoice edit action preserves enrichment (issue #481)', () => {
	it('keeps product_id, tax_rate and pack columns, and recomputes content_hash', async () => {
		const out = await saveReviewedInvoice(null, lineForm({ invoice_number: 'INV-481', low_confidence_ack: 'true' }, '60.00'), rid);
		expect(out.type).toBe('saved');
		const invoiceId = (out as { invoiceId: number }).invoiceId;

		const [before] = await testSql`
			SELECT li.product_id, li.tax_rate, li.normalized_unit_price, li.units_per_pack, li.base_unit, i.content_hash
			FROM invoice_line_items li JOIN invoices i ON i.id = li.invoice_id
			WHERE li.invoice_id = ${invoiceId}`;
		expect(before.product_id).not.toBeNull();
		expect(before.normalized_unit_price).not.toBeNull();
		expect(Number(before.units_per_pack)).toBe(6);

		await runEdit(invoiceId, '70.00');

		const [after] = await testSql`
			SELECT li.product_id, li.tax_rate, li.normalized_unit_price, li.units_per_pack, li.base_unit, i.content_hash
			FROM invoice_line_items li JOIN invoices i ON i.id = li.invoice_id
			WHERE li.invoice_id = ${invoiceId}`;

		expect(after.product_id).toBe(before.product_id);
		expect(Number(after.tax_rate)).toBe(10);
		expect(after.normalized_unit_price).toBe(before.normalized_unit_price);
		expect(Number(after.units_per_pack)).toBe(6);
		expect(after.base_unit).toBe(before.base_unit);
		expect(after.content_hash).not.toBe(before.content_hash);
	});

	it('writes an audit-log row with the pre-edit snapshot', async () => {
		const rows = await testSql`
			SELECT action, user_id, snapshot FROM invoice_audit_log
			WHERE restaurant_id = ${rid} AND action = 'edit'`;
		expect(rows.length).toBe(1);
		expect(rows[0].user_id).toBe(USER_ID);
		expect(JSON.parse(rows[0].snapshot).lineItems[0].description).toBe(DESC);
	});
});
