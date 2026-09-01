/**
 * End-to-end wiring test for issue #449 (Hallazgo 2) and issue #809: the
 * dedup gate only catches the same file uploaded twice (content hash) or a
 * repeated supplier+invoice_number pair — it cannot tell that an albarán
 * captured at delivery and the factura fiscal for that same delivery,
 * arriving weeks later, are the same real-world purchase, since the two
 * documents carry different numbers by construction.
 *
 * This exercises runPossibleDuplicatePurchase (src/lib/server/alerts.ts) as
 * wired into saveReviewedInvoice: when a same-supplier invoice of the
 * *opposite* document_type exists close in date and similar in amount, AND
 * their line items overlap enough to be confident, the two invoices are
 * linked (invoices.linked_invoice_id, bidirectional) and a
 * 'related_document_found' notification is raised instead of a bare
 * duplicate-risk warning. Without that line-item overlap it falls back to
 * the softer 'possible_duplicate_purchase' nudge and no link is persisted.
 *
 * The link is a symmetric pairing: re-linking a document that was already
 * paired clears the stale partner's back-reference, so no invoice is left
 * pointing at a document that no longer points back.
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

const fakeItem = (documentType: 'factura' | 'albaran' | null): BatchItem =>
	fakeBatchItem({ restaurantId: rid, extractedData: { document_type: documentType, confidence: 1 } });

function form(opts: {
	invoiceNumber: string;
	invoiceDate: string;
	totalAmount: string;
	supplier: string;
	lineDescription?: string;
}): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier);
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', opts.invoiceDate);
	fd.append('total_amount', opts.totalAmount);
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', opts.lineDescription ?? 'Producto de prueba');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'ud');
	fd.append('line_unit_prices', opts.totalAmount);
	fd.append('line_total_prices', opts.totalAmount);
	fd.append('line_tax_rates', '');
	return fd;
}

async function notificationsByType(invoiceId: number, notificationType: string) {
	return testSql`
		SELECT payload FROM system_notifications
		WHERE restaurant_id = ${rid} AND invoice_id = ${invoiceId}
			AND notification_type = ${notificationType}`;
}

async function duplicateNotifications(invoiceId: number) {
	return notificationsByType(invoiceId, 'possible_duplicate_purchase');
}

async function linkedInvoiceId(invoiceId: number): Promise<number | null> {
	const rows = await testSql`SELECT linked_invoice_id FROM invoices WHERE id = ${invoiceId}`;
	return rows[0]?.linked_invoice_id ?? null;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-dupe-purchase');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → possible duplicate / related document linking (issues #449, #809)', () => {
	it('links a factura to its albarán when supplier, date, amount and line items all match', async () => {
		const supplier = '__inv_dupe_a__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-2024-001', invoiceDate: '2024-01-01', totalAmount: '250.00', supplier }),
			rid,
		);
		expect(albaran.type).toBe('saved');
		if (albaran.type !== 'saved') return;

		const factura = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-2024-099', invoiceDate: '2024-01-12', totalAmount: '255.00', supplier }),
			rid,
		);
		expect(factura.type).toBe('saved');
		if (factura.type !== 'saved') return;

		const related = await notificationsByType(factura.invoiceId, 'related_document_found');
		expect(related).toHaveLength(1);
		const payload = related[0].payload;
		expect(payload.matchedInvoiceId).toBe(albaran.invoiceId);
		expect(payload.otherDocumentType).toBe('albaran');

		expect(await duplicateNotifications(factura.invoiceId)).toHaveLength(0);
		expect(await linkedInvoiceId(factura.invoiceId)).toBe(albaran.invoiceId);
		expect(await linkedInvoiceId(albaran.invoiceId)).toBe(factura.invoiceId);
	});

	it('falls back to a duplicate-risk warning (no link) when line items do not overlap', async () => {
		const supplier = '__inv_dupe_lines__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({
				invoiceNumber: 'ALB-2024-005', invoiceDate: '2024-01-15', totalAmount: '90.00', supplier,
				lineDescription: 'Tomates frescos',
			}),
			rid,
		);
		expect(albaran.type).toBe('saved');
		if (albaran.type !== 'saved') return;

		const factura = await saveReviewedInvoice(
			fakeItem('factura'),
			form({
				invoiceNumber: 'FAC-2024-105', invoiceDate: '2024-01-18', totalAmount: '92.00', supplier,
				lineDescription: 'Servicio de transporte',
			}),
			rid,
		);
		expect(factura.type).toBe('saved');
		if (factura.type !== 'saved') return;

		const notifications = await duplicateNotifications(factura.invoiceId);
		expect(notifications).toHaveLength(1);
		expect(notifications[0].payload.matchedInvoiceId).toBe(albaran.invoiceId);

		expect(await notificationsByType(factura.invoiceId, 'related_document_found')).toHaveLength(0);
		expect(await linkedInvoiceId(factura.invoiceId)).toBeNull();
		expect(await linkedInvoiceId(albaran.invoiceId)).toBeNull();
	});

	it('re-linking to a closer match clears the previous partner back-reference', async () => {
		const supplier = '__inv_dupe_relink__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-2024-040', invoiceDate: '2024-07-01', totalAmount: '100.00', supplier }),
			rid,
		);
		expect(albaran.type).toBe('saved');
		if (albaran.type !== 'saved') return;

		const firstFactura = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-2024-300', invoiceDate: '2024-07-05', totalAmount: '100.00', supplier }),
			rid,
		);
		expect(firstFactura.type).toBe('saved');
		if (firstFactura.type !== 'saved') return;

		expect(await linkedInvoiceId(albaran.invoiceId)).toBe(firstFactura.invoiceId);
		expect(await linkedInvoiceId(firstFactura.invoiceId)).toBe(albaran.invoiceId);

		const secondFactura = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-2024-301', invoiceDate: '2024-07-02', totalAmount: '100.00', supplier }),
			rid,
		);
		expect(secondFactura.type).toBe('saved');
		if (secondFactura.type !== 'saved') return;

		expect(await linkedInvoiceId(secondFactura.invoiceId)).toBe(albaran.invoiceId);
		expect(await linkedInvoiceId(albaran.invoiceId)).toBe(secondFactura.invoiceId);
		expect(await linkedInvoiceId(firstFactura.invoiceId)).toBeNull();
	});

	it('does not flag when the amounts are far apart', async () => {
		const supplier = '__inv_dupe_b__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-2024-010', invoiceDate: '2024-02-01', totalAmount: '80.00', supplier }),
			rid,
		);
		expect(albaran.type).toBe('saved');

		const factura = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-2024-110', invoiceDate: '2024-02-05', totalAmount: '500.00', supplier }),
			rid,
		);
		expect(factura.type).toBe('saved');
		if (factura.type !== 'saved') return;

		expect(await duplicateNotifications(factura.invoiceId)).toHaveLength(0);
	});

	it('does not flag when the dates are far apart', async () => {
		const supplier = '__inv_dupe_c__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-2024-020', invoiceDate: '2024-03-01', totalAmount: '120.00', supplier }),
			rid,
		);
		expect(albaran.type).toBe('saved');

		const factura = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-2024-120', invoiceDate: '2024-05-01', totalAmount: '120.00', supplier }),
			rid,
		);
		expect(factura.type).toBe('saved');
		if (factura.type !== 'saved') return;

		expect(await duplicateNotifications(factura.invoiceId)).toHaveLength(0);
	});

	it('does not flag two documents of the same document_type (fiscally not the ambiguous case)', async () => {
		const supplier = '__inv_dupe_d__';

		const first = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-2024-200', invoiceDate: '2024-04-01', totalAmount: '90.00', supplier }),
			rid,
		);
		expect(first.type).toBe('saved');

		const second = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-2024-201', invoiceDate: '2024-04-03', totalAmount: '91.00', supplier }),
			rid,
		);
		expect(second.type).toBe('saved');
		if (second.type !== 'saved') return;

		expect(await duplicateNotifications(second.invoiceId)).toHaveLength(0);
	});

	it('does not flag (and does not block the save) when document_type is unknown', async () => {
		const supplier = '__inv_dupe_e__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-2024-030', invoiceDate: '2024-06-01', totalAmount: '60.00', supplier }),
			rid,
		);
		expect(albaran.type).toBe('saved');

		const unknown = await saveReviewedInvoice(
			fakeItem(null),
			form({ invoiceNumber: 'UNK-2024-030', invoiceDate: '2024-06-02', totalAmount: '60.00', supplier }),
			rid,
		);
		expect(unknown.type).toBe('saved');
		if (unknown.type !== 'saved') return;

		expect(await duplicateNotifications(unknown.invoiceId)).toHaveLength(0);
	});
});
