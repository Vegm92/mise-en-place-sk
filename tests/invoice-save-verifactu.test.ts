/**
 * End-to-end wiring test for issue #392: saveReviewedInvoice must run the
 * VERI*FACTU QR tamper check (parseQrUrl -> detectVerifactuMismatch) on every
 * invoice whose extraction decoded an AEAT QR, and persist/surface the result
 * — not just expose the two functions as isolated, untested-in-production
 * helpers (see tests/qr.test.ts for their unit coverage).
 *
 * DB-backed; the db singleton is swapped for the test client (ssl:'require'
 * in db.ts does not speak to local Postgres). Skipped without DATABASE_URL.
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

let rid = '';

const VALID_QR =
	'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=FAC-2024-001&fecha=15-01-2024&importe=1250.00';

function fakeItem(extractedData: Record<string, unknown> | null): BatchItem {
	return {
		id: 'item-1',
		batchId: 'batch-1',
		restaurantId: rid,
		position: 0,
		fileKey: 'fake.pdf',
		displayName: 'fake.pdf',
		status: 'done',
		extractedData,
		conversionNotes: null,
		extractError: null,
		queuedAt: null,
		source: 'web',
		sourceRef: null,
		jobCode: null,
		reviewStatus: null,
	};
}

function form(opts: {
	invoiceNumber: string;
	invoiceDate: string;
	totalAmount: string;
	supplier?: string;
}): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier ?? '__inv_verifactu_sup__');
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', opts.invoiceDate);
	fd.append('total_amount', opts.totalAmount);
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', 'Producto de prueba');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'ud');
	fd.append('line_unit_prices', opts.totalAmount);
	fd.append('line_total_prices', opts.totalAmount);
	fd.append('line_tax_rates', '');
	return fd;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-verifactu');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → VERI*FACTU QR check (issue #392)', () => {
	it('flags a real mismatch: submitted total diverges from the AEAT QR amount', async () => {
		const item = fakeItem({ qr_url: VALID_QR, confidence: 1 });
		const out = await saveReviewedInvoice(
			item,
			form({ invoiceNumber: 'FAC-2024-001', invoiceDate: '2024-01-15', totalAmount: '9999.00' }),
			rid,
		);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [invoiceRow] = await testSql`
			SELECT qr_url, qr_mismatch FROM invoices WHERE id = ${out.invoiceId}`;
		expect(invoiceRow.qr_url).toBe(VALID_QR);
		expect(invoiceRow.qr_mismatch).toBe(1);

		const notifications = await testSql`
			SELECT payload FROM system_notifications
			WHERE restaurant_id = ${rid} AND invoice_id = ${out.invoiceId}
				AND notification_type = 'verifactu_qr_mismatch'`;
		expect(notifications).toHaveLength(1);
		const payload = notifications[0].payload;
		expect(payload.mismatches).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ field: 'importe', qrValue: '1250.00', aiValue: '9999' }),
			]),
		);
	});

	it('flags a tampered invoice number against a matching QR', async () => {
		const item = fakeItem({ qr_url: VALID_QR, confidence: 1 });
		const out = await saveReviewedInvoice(
			item,
			form({ invoiceNumber: 'FAC-2024-TAMPERED', invoiceDate: '2024-01-15', totalAmount: '1250.00' }),
			rid,
		);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [invoiceRow] = await testSql`
			SELECT qr_mismatch FROM invoices WHERE id = ${out.invoiceId}`;
		expect(invoiceRow.qr_mismatch).toBe(1);

		const notifications = await testSql`
			SELECT payload FROM system_notifications
			WHERE restaurant_id = ${rid} AND invoice_id = ${out.invoiceId}
				AND notification_type = 'verifactu_qr_mismatch'`;
		expect(notifications).toHaveLength(1);
		const payload = notifications[0].payload;
		expect(payload.mismatches.some((m: { field: string }) => m.field === 'numserie')).toBe(true);
	});

	it('does not false-positive when the QR matches the saved invoice exactly', async () => {
		const item = fakeItem({ qr_url: VALID_QR, confidence: 1 });
		const out = await saveReviewedInvoice(
			item,
			form({
				invoiceNumber: 'FAC-2024-001',
				invoiceDate: '2024-01-15',
				totalAmount: '1250.00',
				supplier: '__inv_verifactu_sup_match__',
			}),
			rid,
		);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [invoiceRow] = await testSql`
			SELECT qr_url, qr_mismatch FROM invoices WHERE id = ${out.invoiceId}`;
		expect(invoiceRow.qr_url).toBe(VALID_QR);
		expect(invoiceRow.qr_mismatch).toBe(0);

		const notifications = await testSql`
			SELECT id FROM system_notifications
			WHERE restaurant_id = ${rid} AND invoice_id = ${out.invoiceId}
				AND notification_type = 'verifactu_qr_mismatch'`;
		expect(notifications).toHaveLength(0);
	});

	it('is a no-op (no crash, no false mismatch) when extraction found no QR', async () => {
		const item = fakeItem({ qr_url: null, confidence: 1 });
		const out = await saveReviewedInvoice(
			item,
			form({ invoiceNumber: 'FAC-NOQR-001', invoiceDate: '2024-02-01', totalAmount: '50.00' }),
			rid,
		);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const [invoiceRow] = await testSql`
			SELECT qr_url, qr_mismatch FROM invoices WHERE id = ${out.invoiceId}`;
		expect(invoiceRow.qr_url).toBeNull();
		expect(invoiceRow.qr_mismatch).toBe(0);
	});
});
