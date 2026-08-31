/**
 * End-to-end wiring test for issue #808: the line-sum-vs-total reconciliation
 * used to run only inside `saveReviewedInvoice`, recomputed from whatever the
 * reviewer's form submitted — so a batch item that nobody ever corrected, and
 * whose form is pre-filled straight from the extraction, could still land as
 * `review_state: 'revisado'` if the review screen's own default submission
 * happened not to trip the check (e.g. the reviewer accepted the extraction
 * unedited but the tax bands they never touched were what the check compared
 * against). extraction-worker.ts now runs the same reconciliation on the raw
 * extraction the moment it finishes and stamps `total_mismatch` onto
 * `extracted_data` — this test pins that `saveReviewedInvoice` honours that
 * flag as an independent signal into `resolveReviewState`, on top of (not
 * instead of) recomputing the check from what was actually submitted.
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

function form(opts: { invoiceNumber: string; totalAmount: string; lineTotal: string; supplier?: string }): FormData {
	const fd = new FormData();
	fd.append('supplier_name', opts.supplier ?? '__inv_total_mismatch_sup__');
	fd.append('invoice_number', opts.invoiceNumber);
	fd.append('invoice_date', '2024-03-01');
	fd.append('total_amount', opts.totalAmount);
	fd.append('line_descriptions', 'Producto de prueba');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'ud');
	fd.append('line_unit_prices', opts.lineTotal);
	fd.append('line_total_prices', opts.lineTotal);
	fd.append('line_tax_rates', '');
	return fd;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('inv-total-mismatch');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

async function saveAndGetReviewState(
	extractedData: Record<string, unknown> | null,
	formOpts: { invoiceNumber: string; totalAmount: string; lineTotal: string; supplier?: string },
): Promise<string> {
	const out = await saveReviewedInvoice(fakeItem(extractedData), form(formOpts), rid);
	expect(out.type).toBe('saved');
	if (out.type !== 'saved') throw new Error('unreachable — asserted above');

	const [invoiceRow] = await testSql`
		SELECT review_state FROM invoices WHERE id = ${out.invoiceId}`;
	return invoiceRow.review_state;
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → extraction-time total_mismatch signal (issue #808)', () => {
	it('marks the invoice incidencia when the extraction flagged a mismatch, even though the unedited submission reconciles', async () => {
		// The reviewer accepted the extraction as-is: the submitted line total
		// and total_amount agree with each other (100 == 100), so a check
		// recomputed only from the submission would pass — but the extraction
		// step itself had already detected the raw lines didn't add up, e.g.
		// because Gemini's own tax fallback force-reconciled the gap.
		const reviewState = await saveAndGetReviewState(
			{ confidence: 1, total_mismatch: true },
			{ invoiceNumber: 'FAC-808-001', totalAmount: '100.00', lineTotal: '100.00' },
		);
		expect(reviewState).toBe('incidencia');
	});

	it('still marks incidencia when the reviewer submits a fresh mismatch, independent of the extraction-time flag', async () => {
		const reviewState = await saveAndGetReviewState(
			{ confidence: 1, total_mismatch: false },
			{ invoiceNumber: 'FAC-808-002', totalAmount: '100.00', lineTotal: '40.00' },
		);
		expect(reviewState).toBe('incidencia');
	});

	it('is revisado when neither the extraction nor the submission show a mismatch', async () => {
		const reviewState = await saveAndGetReviewState(
			{ confidence: 1, total_mismatch: false },
			{
				invoiceNumber: 'FAC-808-003',
				totalAmount: '100.00',
				lineTotal: '100.00',
				supplier: '__inv_total_mismatch_sup_clean__',
			},
		);
		expect(reviewState).toBe('revisado');
	});
});
