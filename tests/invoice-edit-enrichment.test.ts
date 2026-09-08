/**
 * Issue #481: the invoice edit action delete-and-reinserts line items. It used
 * to reinsert only five columns, silently dropping product_id, tax_rate and the
 * whole pack/unit block, and it never recomputed invoices.content_hash.
 *
 * Issue #520 asked whether the test that closed #481 actually covers the gap it
 * describes — "nine silently-dropped columns". It named four of them by hand,
 * so the other five, and any tenth column added later, were still unguarded.
 * One of the five was genuinely still broken: the edit page never rendered
 * `line_supplier_skus`, so `parseLineInputs` read nothing and every edit nulled
 * the supplier SKU.
 *
 * The enrichment column set is now derived from the schema — every column of
 * `invoice_line_items` that is neither an identity column nor typed into the
 * edit form. Adding a column to the table therefore adds it to this test.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTableColumns } from 'drizzle-orm';

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
import { invoiceLineItems } from '../src/lib/server/schema';

let rid = '';
const USER_ID = 'user-481';
const SUPPLIER = '__inv_edit_sup__';
const DESC = 'Aceite Oliva 6x1L';
const SKU = 'SKU-481-AOV';

/** Columns that identify the row rather than describe the goods. */
const IDENTITY_COLUMNS = new Set(['id', 'restaurantId', 'invoiceId']);

/** Columns the edit form posts back, so the user's own edit is meant to win. */
const FORM_COLUMNS = new Set(['description', 'quantity', 'unit', 'unitPrice', 'totalPrice', 'taxRate']);

/**
 * Everything else: derived by the save path (pack parsing, unit normalisation,
 * product matching) and nowhere in the edit form's control. A delete-and-
 * reinsert must carry these across or they are lost with no error.
 */
const ENRICHMENT_COLUMNS = Object.entries(getTableColumns(invoiceLineItems))
	.filter(([name]) => !IDENTITY_COLUMNS.has(name) && !FORM_COLUMNS.has(name))
	.map(([name, col]) => ({ name, column: (col as { name: string }).name }));

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
	fd.append('line_supplier_skus', SKU);
	return fd;
}

/**
 * Mirrors what the edit page's form actually posts. `omit` drops a field so a
 * test can prove the page rendering it is what keeps the value alive.
 */
function editForm(number: string, total: string, omit: string[] = []): FormData {
	const fd = lineForm({ invoice_number: number, version: '1' }, total);
	for (const field of omit) fd.delete(field);
	return fd;
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

const SELECT_COLUMNS = ENRICHMENT_COLUMNS.map((c) => c.column).join(', ');

async function lineRow(invoiceId: number): Promise<Record<string, unknown>> {
	const [row] = await testSql.unsafe(
		`SELECT ${SELECT_COLUMNS} FROM invoice_line_items WHERE invoice_id = $1`,
		[invoiceId]
	);
	return row as Record<string, unknown>;
}

async function createInvoice(tag: string, total: string): Promise<number> {
	const out = await saveReviewedInvoice(
		null,
		lineForm({ invoice_number: `INV-481-${tag}`, low_confidence_ack: 'true' }, total),
		rid
	);
	expect(out.type).toBe('saved');
	return (out as { invoiceId: number }).invoiceId;
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

describe.skipIf(!hasDbEnv)('invoice edit action preserves enrichment (issues #481, #520)', () => {
	it('derives a non-empty enrichment column set from the schema', () => {
		expect(ENRICHMENT_COLUMNS.length).toBeGreaterThan(0);
		expect(ENRICHMENT_COLUMNS.map((c) => c.name)).toContain('productId');
		expect(ENRICHMENT_COLUMNS.map((c) => c.name)).toContain('supplierSku');
	});

	it('populates every enrichment column on create, so the survival check is not vacuous', async () => {
		const invoiceId = await createInvoice('a', '60.00');
		const before = await lineRow(invoiceId);

		for (const { column } of ENRICHMENT_COLUMNS) {
			expect(before[column], `${column} was null on create — this fixture cannot prove it survives an edit`)
				.not.toBeNull();
		}
	});

	it('carries every enrichment column across a delete-and-reinsert edit', async () => {
		const invoiceId = await createInvoice('b', '61.00');
		const before = await lineRow(invoiceId);

		await runEdit(invoiceId, editForm('INV-481-b', '71.00'));
		const after = await lineRow(invoiceId);

		for (const { column } of ENRICHMENT_COLUMNS) {
			expect(String(after[column]), `${column} did not survive the edit`).toBe(String(before[column]));
		}
	});

	it('recomputes the invoice content hash so the edited invoice is not a duplicate of its old self', async () => {
		const invoiceId = await createInvoice('c', '62.00');
		const [before] = await testSql`SELECT content_hash FROM invoices WHERE id = ${invoiceId}`;

		await runEdit(invoiceId, editForm('INV-481-c', '72.00'));
		const [after] = await testSql`SELECT content_hash FROM invoices WHERE id = ${invoiceId}`;

		expect(after!.content_hash).not.toBe(before!.content_hash);
		expect(after!.content_hash).toBeTruthy();
	});

	it('loses the supplier SKU when the form stops posting it — the field the page must render', async () => {
		const invoiceId = await createInvoice('d', '63.00');
		const before = await lineRow(invoiceId);
		expect(before.supplier_sku).toBe(SKU);

		await runEdit(invoiceId, editForm('INV-481-d', '73.00', ['line_supplier_skus']));
		const after = await lineRow(invoiceId);

		expect(after.supplier_sku, 'a form that omits line_supplier_skus nulls the column').toBeNull();
	});

	it('writes an audit-log row with the pre-edit snapshot', async () => {
		const invoiceId = await createInvoice('e', '64.00');
		await runEdit(invoiceId, editForm('INV-481-e', '74.00'));

		const rows = await testSql`
			SELECT action, user_id, snapshot FROM invoice_audit_log
			WHERE restaurant_id = ${rid} AND invoice_id = ${invoiceId} AND action = 'edit'`;

		expect(rows.length).toBe(1);
		expect(rows[0]!.user_id).toBe(USER_ID);
		expect(JSON.parse(rows[0]!.snapshot).lineItems[0].description).toBe(DESC);
	});
});

describe('the edit page posts back every column the save path reads', () => {
	it('renders a line_supplier_skus input, or every edit silently nulls the SKU', () => {
		const src = fs.readFileSync(
			path.join(process.cwd(), 'src/routes/(app)/invoice/[id]/edit/+page.svelte'),
			'utf8'
		);

		expect(src).toContain('name="line_supplier_skus"');
	});
});
