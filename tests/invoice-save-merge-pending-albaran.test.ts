/**
 * Retroactive resolution of "Pendiente de tarificación" (incidencia #3/#8 in
 * INCIDENCIAS_AUDITORIA.md): when a factura arrives for a supplier that has
 * a recent albarán saved without prices, saveReviewedInvoice() should offer
 * to merge the factura's prices onto the albarán's own line items instead of
 * creating a second, duplicate document.
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
import type { BatchItem } from '../src/lib/server/batch-core';

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
	};
}

type Line = { desc: string; unit: string; price?: string };

function form(opts: {
	invoiceNumber: string;
	invoiceDate: string;
	totalAmount?: string;
	supplier: string;
	lines: Line[];
	mergeAck?: boolean;
	mergeRejected?: boolean;
	mergeCandidateId?: number;
}): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier);
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', opts.invoiceDate);
	fd.append('total_amount', opts.totalAmount ?? '');
	fd.append('low_confidence_ack', 'true');
	fd.append('new_supplier_ack', 'true');
	fd.append('merge_ack', opts.mergeAck ? 'true' : 'false');
	fd.append('merge_rejected', opts.mergeRejected ? 'true' : 'false');
	fd.append('merge_candidate_id', opts.mergeCandidateId != null ? String(opts.mergeCandidateId) : '');
	for (const l of opts.lines) {
		fd.append('line_descriptions', l.desc);
		fd.append('line_quantities', '1');
		fd.append('line_units', l.unit);
		fd.append('line_unit_prices', l.price ?? '');
		fd.append('line_total_prices', l.price ?? '');
		fd.append('line_tax_rates', '');
	}
	return fd;
}

async function lineRows(invoiceId: number) {
	return testSql`
		SELECT description, unit_price, total_price FROM invoice_line_items
		WHERE restaurant_id = ${rid} AND invoice_id = ${invoiceId}
		ORDER BY id`;
}

async function invoiceRow(invoiceId: number) {
	const rows = await testSql`
		SELECT document_type, invoice_number FROM invoices
		WHERE restaurant_id = ${rid} AND id = ${invoiceId}`;
	return rows[0] as Record<string, unknown> | undefined;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-merge-pending');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → merge into pending albarán (incidencia #3/#8)', () => {
	it('offers a merge candidate when a factura arrives for a pending albarán, same supplier, close date', async () => {
		const supplier = '__inv_merge_a__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-M-001', invoiceDate: '2026-01-05', supplier, lines: [{ desc: 'Merluza fresca', unit: 'kg' }] }),
			rid,
		);
		expect(albaran.type).toBe('saved');
		if (albaran.type !== 'saved') return;

		const outcome = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-M-001', invoiceDate: '2026-01-08', totalAmount: '48.00', supplier, lines: [{ desc: 'Merluza fresca', unit: 'kg', price: '48.00' }] }),
			rid,
		);
		expect(outcome.type).toBe('mergeCandidate');
		if (outcome.type !== 'mergeCandidate') return;
		expect(outcome.candidate.invoiceId).toBe(albaran.invoiceId);
		expect(outcome.candidate.lineCount).toBe(1);
	});

	it('merges prices onto the albarán and does not create a second invoice, when merge_ack is confirmed', async () => {
		const supplier = '__inv_merge_b__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-M-010', invoiceDate: '2026-02-05', supplier, lines: [{ desc: 'Merluza fresca', unit: 'kg' }] }),
			rid,
		);
		expect(albaran.type).toBe('saved');
		if (albaran.type !== 'saved') return;

		const candidateOutcome = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-M-010', invoiceDate: '2026-02-08', totalAmount: '48.00', supplier, lines: [{ desc: 'Merluza fresca', unit: 'kg', price: '48.00' }] }),
			rid,
		);
		expect(candidateOutcome.type).toBe('mergeCandidate');
		if (candidateOutcome.type !== 'mergeCandidate') return;

		const merged = await saveReviewedInvoice(
			fakeItem('factura'),
			form({
				invoiceNumber: 'FAC-M-010', invoiceDate: '2026-02-08', totalAmount: '48.00', supplier,
				lines: [{ desc: 'Merluza fresca', unit: 'kg', price: '48.00' }],
				mergeAck: true, mergeCandidateId: candidateOutcome.candidate.invoiceId,
			}),
			rid,
		);
		expect(merged.type).toBe('saved');
		if (merged.type !== 'saved') return;
		expect(merged.invoiceId).toBe(albaran.invoiceId);

		const invoice = await invoiceRow(albaran.invoiceId);
		expect(invoice?.document_type).toBe('factura');
		expect(invoice?.invoice_number).toBe('FAC-M-010');

		const lines = await lineRows(albaran.invoiceId);
		expect(lines).toHaveLength(1);
		expect(lines[0].total_price).toBe('48.00');
	});

	it('saves the factura as a separate document when merge_rejected is set', async () => {
		const supplier = '__inv_merge_c__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-M-020', invoiceDate: '2026-03-05', supplier, lines: [{ desc: 'Merluza fresca', unit: 'kg' }] }),
			rid,
		);
		expect(albaran.type).toBe('saved');
		if (albaran.type !== 'saved') return;

		const separate = await saveReviewedInvoice(
			fakeItem('factura'),
			form({
				invoiceNumber: 'FAC-M-020', invoiceDate: '2026-03-08', totalAmount: '48.00', supplier,
				lines: [{ desc: 'Merluza fresca', unit: 'kg', price: '48.00' }],
				mergeRejected: true,
			}),
			rid,
		);
		expect(separate.type).toBe('saved');
		if (separate.type !== 'saved') return;
		expect(separate.invoiceId).not.toBe(albaran.invoiceId);

		const albaranLines = await lineRows(albaran.invoiceId);
		expect(albaranLines[0].total_price).toBeNull();
	});

	it('does not offer a merge when the existing invoice has no pending lines', async () => {
		const supplier = '__inv_merge_d__';

		const priced = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-M-030', invoiceDate: '2026-04-05', totalAmount: '10.00', supplier, lines: [{ desc: 'Sal fina', unit: 'kg', price: '10.00' }] }),
			rid,
		);
		expect(priced.type).toBe('saved');

		const factura = await saveReviewedInvoice(
			fakeItem('factura'),
			form({ invoiceNumber: 'FAC-M-030', invoiceDate: '2026-04-08', totalAmount: '10.00', supplier, lines: [{ desc: 'Sal fina', unit: 'kg', price: '10.00' }] }),
			rid,
		);
		expect(factura.type).toBe('saved');
	});

	it('appends a factura line with no matching description onto the merged albarán', async () => {
		const supplier = '__inv_merge_e__';

		const albaran = await saveReviewedInvoice(
			fakeItem('albaran'),
			form({ invoiceNumber: 'ALB-M-040', invoiceDate: '2026-05-05', supplier, lines: [{ desc: 'Merluza fresca', unit: 'kg' }] }),
			rid,
		);
		expect(albaran.type).toBe('saved');
		if (albaran.type !== 'saved') return;

		const candidateOutcome = await saveReviewedInvoice(
			fakeItem('factura'),
			form({
				invoiceNumber: 'FAC-M-040', invoiceDate: '2026-05-08', totalAmount: '68.00', supplier,
				lines: [{ desc: 'Merluza fresca', unit: 'kg', price: '48.00' }, { desc: 'Gambas rojas', unit: 'kg', price: '20.00' }],
			}),
			rid,
		);
		expect(candidateOutcome.type).toBe('mergeCandidate');
		if (candidateOutcome.type !== 'mergeCandidate') return;

		const merged = await saveReviewedInvoice(
			fakeItem('factura'),
			form({
				invoiceNumber: 'FAC-M-040', invoiceDate: '2026-05-08', totalAmount: '68.00', supplier,
				lines: [{ desc: 'Merluza fresca', unit: 'kg', price: '48.00' }, { desc: 'Gambas rojas', unit: 'kg', price: '20.00' }],
				mergeAck: true, mergeCandidateId: candidateOutcome.candidate.invoiceId,
			}),
			rid,
		);
		expect(merged.type).toBe('saved');
		if (merged.type !== 'saved') return;

		const lines = await lineRows(albaran.invoiceId);
		expect(lines).toHaveLength(2);
		expect(lines.map((l) => l.description).sort()).toEqual(['Gambas rojas', 'Merluza fresca']);
	});
});
