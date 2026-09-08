/**
 * End-to-end wiring test for issue #461: saveReviewedInvoice must persist the
 * document_type Gemini already infers during extraction (factura vs albarán),
 * without changing existing save/dedup behaviour when the field is absent or
 * unrecognised (older extractions, or XML paths that predate this field).
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
import type { BatchItem } from '../src/lib/server/batch';
import { fakeBatchItem } from './helpers/batch-item';

let rid = '';

const fakeItem = (extractedData: Record<string, unknown> | null): BatchItem =>
	fakeBatchItem({ restaurantId: rid, extractedData });

function form(opts: { invoiceNumber: string; supplier?: string; totalAmount?: string }): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier ?? '__inv_doctype_sup__');
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', '2024-01-15');
	fd.append('total_amount', opts.totalAmount ?? '100.00');
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', 'Producto de prueba');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'ud');
	fd.append('line_unit_prices', opts.totalAmount ?? '100.00');
	fd.append('line_total_prices', opts.totalAmount ?? '100.00');
	fd.append('line_tax_rates', '');
	return fd;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-doctype');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → document_type persistence (issue #461)', () => {
	it("persists 'factura' when extraction classified the document as such", async () => {
		const item = fakeItem({ document_type: 'factura', confidence: 1 });
		const out = await saveReviewedInvoice(item, form({ invoiceNumber: 'DOC-FAC-001' }), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [row] = await testSql`SELECT document_type FROM invoices WHERE id = ${out.invoiceId}`;
		expect(row!.document_type).toBe('factura');
	});

	it("persists 'albaran' when extraction classified the document as such", async () => {
		const item = fakeItem({ document_type: 'albaran', confidence: 1 });
		const out = await saveReviewedInvoice(item, form({ invoiceNumber: 'DOC-ALB-001' }), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [row] = await testSql`SELECT document_type FROM invoices WHERE id = ${out.invoiceId}`;
		expect(row!.document_type).toBe('albaran');
	});

	it('stores null and still saves when extraction omits document_type (older/absent data)', async () => {
		const item = fakeItem({ confidence: 1 });
		const out = await saveReviewedInvoice(item, form({ invoiceNumber: 'DOC-NONE-001' }), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [row] = await testSql`SELECT document_type FROM invoices WHERE id = ${out.invoiceId}`;
		expect(row!.document_type).toBeNull();
	});

	it('coerces an unrecognised document_type value to null instead of persisting garbage', async () => {
		const item = fakeItem({ document_type: 'nota_de_credito', confidence: 1 });
		const out = await saveReviewedInvoice(item, form({ invoiceNumber: 'DOC-BAD-001' }), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [row] = await testSql`SELECT document_type FROM invoices WHERE id = ${out.invoiceId}`;
		expect(row!.document_type).toBeNull();
	});

	it('is a no-op for save/dedup behaviour when there is no extraction item at all', async () => {
		const out = await saveReviewedInvoice(null, form({ invoiceNumber: 'DOC-NULLITEM-001' }), rid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [row] = await testSql`SELECT document_type FROM invoices WHERE id = ${out.invoiceId}`;
		expect(row!.document_type).toBeNull();
	});
});
