/**
 * End-to-end wiring test for issue #449 (Hallazgo 2): the dedup gate only
 * catches the same file uploaded twice (content hash) or a repeated
 * supplier+invoice_number pair — it cannot tell that an albarán captured at
 * delivery and the factura fiscal for that same delivery, arriving weeks
 * later, are the same real-world purchase, since the two documents carry
 * different numbers by construction.
 *
 * This exercises runPossibleDuplicatePurchase (src/lib/server/alerts.ts) as
 * wired into saveReviewedInvoice: a soft, non-blocking review nudge — never
 * a save failure — raised only when a same-supplier invoice of the *opposite*
 * document_type exists close in date and similar in amount.
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

let rid = '';

function fakeItem(documentType: 'factura' | 'albaran' | null): BatchItem {
	return {
		id: 'item-1',
		batchId: 'batch-1',
		restaurantId: rid,
		position: 0,
		fileKey: 'fake.pdf',
		displayName: 'fake.pdf',
		status: 'done',
		extractedData: { document_type: documentType, confidence: 1 },
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
	supplier: string;
}): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier);
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

async function duplicateNotifications(invoiceId: number) {
	return testSql`
		SELECT payload FROM system_notifications
		WHERE restaurant_id = ${rid} AND invoice_id = ${invoiceId}
			AND notification_type = 'possible_duplicate_purchase'`;
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

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → possible duplicate purchase nudge (issue #449)', () => {
	it('flags a factura arriving weeks after an albarán from the same supplier, similar amount', async () => {
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

		const notifications = await duplicateNotifications(factura.invoiceId);
		expect(notifications).toHaveLength(1);
		const payload = notifications[0].payload;
		expect(payload.matchedInvoiceId).toBe(albaran.invoiceId);
		expect(payload.otherDocumentType).toBe('albaran');
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
