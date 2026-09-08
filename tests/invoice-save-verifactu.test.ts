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
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testSql, hasDbEnv } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import type { BatchItem } from '../src/lib/server/batch';
import { fakeBatchItem } from './helpers/batch-item';
import { singleLineInvoiceForm, saveInvoiceOrThrow } from './helpers/invoice-save-form';

const restaurant = useTestRestaurant('inv-verifactu');
const UID = randomUUID();

const VALID_QR =
	'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=FAC-2024-001&fecha=15-01-2024&importe=1250.00';

const fakeItem = (extractedData: Record<string, unknown> | null): BatchItem =>
	fakeBatchItem({ restaurantId: restaurant.id, extractedData });

const form = singleLineInvoiceForm;

/** Saves a QR-bearing invoice and returns its id, asserting the save itself succeeded. */
function saveVerifactuInvoice(qrUrl: string | null, formOpts: Parameters<typeof form>[0]): Promise<number> {
	return saveInvoiceOrThrow(fakeItem({ qr_url: qrUrl, confidence: 1 }), form(formOpts), restaurant.id, UID);
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → VERI*FACTU QR check (issue #392)', () => {
	it('flags a real mismatch: submitted total diverges from the AEAT QR amount', async () => {
		const invoiceId = await saveVerifactuInvoice(VALID_QR, { invoiceNumber: 'FAC-2024-001', invoiceDate: '2024-01-15', totalAmount: '9999.00' });

		const [invoiceRow] = await testSql`
			SELECT qr_url, qr_mismatch FROM invoices WHERE id = ${invoiceId}`;
		expect(invoiceRow.qr_url).toBe(VALID_QR);
		expect(invoiceRow.qr_mismatch).toBe(true);

		const notifications = await testSql`
			SELECT payload FROM system_notifications
			WHERE restaurant_id = ${restaurant.id} AND invoice_id = ${invoiceId}
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
		const invoiceId = await saveVerifactuInvoice(VALID_QR, { invoiceNumber: 'FAC-2024-TAMPERED', invoiceDate: '2024-01-15', totalAmount: '1250.00' });

		const [invoiceRow] = await testSql`
			SELECT qr_mismatch FROM invoices WHERE id = ${invoiceId}`;
		expect(invoiceRow.qr_mismatch).toBe(true);

		const notifications = await testSql`
			SELECT payload FROM system_notifications
			WHERE restaurant_id = ${restaurant.id} AND invoice_id = ${invoiceId}
				AND notification_type = 'verifactu_qr_mismatch'`;
		expect(notifications).toHaveLength(1);
		const payload = notifications[0].payload;
		expect(payload.mismatches.some((m: { field: string }) => m.field === 'numserie')).toBe(true);
	});

	it('does not false-positive when the QR matches the saved invoice exactly', async () => {
		const invoiceId = await saveVerifactuInvoice(VALID_QR, {
			invoiceNumber: 'FAC-2024-001',
			invoiceDate: '2024-01-15',
			totalAmount: '1250.00',
			supplier: '__inv_verifactu_sup_match__',
		});

		const [invoiceRow] = await testSql`
			SELECT qr_url, qr_mismatch FROM invoices WHERE id = ${invoiceId}`;
		expect(invoiceRow.qr_url).toBe(VALID_QR);
		expect(invoiceRow.qr_mismatch).toBe(false);

		const notifications = await testSql`
			SELECT id FROM system_notifications
			WHERE restaurant_id = ${restaurant.id} AND invoice_id = ${invoiceId}
				AND notification_type = 'verifactu_qr_mismatch'`;
		expect(notifications).toHaveLength(0);
	});

	it('is a no-op (no crash, no false mismatch) when extraction found no QR', async () => {
		const invoiceId = await saveVerifactuInvoice(null, { invoiceNumber: 'FAC-NOQR-001', invoiceDate: '2024-02-01', totalAmount: '50.00' });

		const [invoiceRow] = await testSql`
			SELECT qr_url, qr_mismatch FROM invoices WHERE id = ${invoiceId}`;
		expect(invoiceRow.qr_url).toBeNull();
		expect(invoiceRow.qr_mismatch).toBe(false);
	});
});
