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

interface FormLine {
	description: string;
	quantity: string;
	unit: string;
	unitPrice: string;
	totalPrice: string;
}

function form(opts: {
	invoiceNumber: string;
	invoiceDate: string;
	totalAmount: string;
	supplier: string;
	lineDescription?: string;
	lines?: FormLine[];
	lowConfidenceAck?: boolean;
	purchaseOrder?: string;
}): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier);
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', opts.invoiceDate);
	fd.append('total_amount', opts.totalAmount);
	if (opts.purchaseOrder) fd.append('purchase_order', opts.purchaseOrder);
	if (opts.lowConfidenceAck ?? true) fd.append('low_confidence_ack', 'true');
	const lines = opts.lines ?? [{
		description: opts.lineDescription ?? 'Producto de prueba',
		quantity: '1', unit: 'ud', unitPrice: opts.totalAmount, totalPrice: opts.totalAmount,
	}];
	for (const l of lines) {
		fd.append('line_descriptions', l.description);
		fd.append('line_quantities', l.quantity);
		fd.append('line_units', l.unit);
		fd.append('line_unit_prices', l.unitPrice);
		fd.append('line_total_prices', l.totalPrice);
		fd.append('line_tax_rates', '');
	}
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

async function reviewState(invoiceId: number): Promise<{ reviewState: string; incidenceKind: string | null }> {
	const rows = await testSql`SELECT review_state, incidence_kind FROM invoices WHERE id = ${invoiceId}`;
	return { reviewState: rows[0]?.review_state, incidenceKind: rows[0]?.incidence_kind ?? null };
}

async function saveOrThrow(
	documentType: 'factura' | 'albaran',
	opts: Parameters<typeof form>[0],
): Promise<number> {
	const result = await saveReviewedInvoice(fakeItem(documentType), form(opts), rid);
	expect(result.type).toBe('saved');
	if (result.type !== 'saved') throw new Error('save failed');
	return result.invoiceId;
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
		const payload = related[0]!.payload;
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
		expect(notifications[0]!.payload.matchedInvoiceId).toBe(albaran.invoiceId);

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

	it('links via matching purchase_order even when date and amount fall outside the normal window', async () => {
		const supplier = '__inv_dupe_po__';

		const albaranId = await saveOrThrow('albaran', {
			invoiceNumber: 'ALB-2024-500', invoiceDate: '2024-01-01', totalAmount: '80.00', supplier,
			purchaseOrder: 'PO-7788',
		});
		const facturaId = await saveOrThrow('factura', {
			invoiceNumber: 'FAC-2024-500', invoiceDate: '2024-05-01', totalAmount: '900.00', supplier,
			purchaseOrder: 'po-7788',
		});

		const related = await notificationsByType(facturaId, 'related_document_found');
		expect(related).toHaveLength(1);
		expect(related[0]!.payload.matchedInvoiceId).toBe(albaranId);

		expect(await linkedInvoiceId(facturaId)).toBe(albaranId);
		expect(await linkedInvoiceId(albaranId)).toBe(facturaId);
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

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → line item reconciliation on the linked pair (issue #886)', () => {
	it('flags a missing line item and marks both linked documents as a document incidencia', async () => {
		const supplier = '__inv_dupe_recon_a__';

		const albaranId = await saveOrThrow('albaran', {
			invoiceNumber: 'ALB-2024-900', invoiceDate: '2024-08-01', totalAmount: '188.00', supplier, lowConfidenceAck: false,
			lines: [
				{ description: 'Aceite de oliva', quantity: '2', unit: 'ud', unitPrice: '90.00', totalPrice: '180.00' },
				{ description: 'Servilletas', quantity: '1', unit: 'ud', unitPrice: '8.00', totalPrice: '8.00' },
			],
		});
		const facturaId = await saveOrThrow('factura', {
			invoiceNumber: 'FAC-2024-900', invoiceDate: '2024-08-10', totalAmount: '180.00', supplier, lowConfidenceAck: false,
			lines: [
				{ description: 'Aceite de oliva', quantity: '2', unit: 'ud', unitPrice: '90.00', totalPrice: '180.00' },
			],
		});

		expect(await linkedInvoiceId(facturaId)).toBe(albaranId);

		const mismatchRows = await notificationsByType(facturaId, 'line_item_mismatch');
		expect(mismatchRows).toHaveLength(1);
		const payload = mismatchRows[0]!.payload;
		expect(payload.linkedInvoiceId).toBe(albaranId);
		expect(payload.missingInInvoice).toHaveLength(1);
		expect(payload.missingInInvoice[0].description).toBe('Servilletas');
		expect(payload.missingInDeliveryNote).toEqual([]);
		expect(payload.quantityMismatches).toEqual([]);

		expect(await reviewState(facturaId)).toEqual({ reviewState: 'incidencia', incidenceKind: 'documento' });
		expect(await reviewState(albaranId)).toEqual({ reviewState: 'incidencia', incidenceKind: 'documento' });
	});

	it('does not flag a line-item mismatch when the linked documents match line for line', async () => {
		const supplier = '__inv_dupe_recon_b__';
		const lines = [
			{ description: 'Tomate frito', quantity: '3', unit: 'ud', unitPrice: '4.00', totalPrice: '12.00' },
		];

		const albaranId = await saveOrThrow('albaran', {
			invoiceNumber: 'ALB-2024-901', invoiceDate: '2024-08-15', totalAmount: '12.00', supplier, lines, lowConfidenceAck: false,
		});
		const facturaId = await saveOrThrow('factura', {
			invoiceNumber: 'FAC-2024-901', invoiceDate: '2024-08-16', totalAmount: '12.00', supplier, lines, lowConfidenceAck: false,
		});

		expect(await linkedInvoiceId(facturaId)).toBe(albaranId);
		expect(await notificationsByType(facturaId, 'line_item_mismatch')).toHaveLength(0);
		expect((await reviewState(facturaId)).reviewState).toBe('revisado');
	});
});
