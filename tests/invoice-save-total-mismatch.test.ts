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

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';
import type { BatchItem } from '../src/lib/server/batch';
import { fakeBatchItem } from './helpers/batch-item';

let rid = '';

function mismatchFakeItem(extractedData: Record<string, unknown> | null): BatchItem {
	return fakeBatchItem({
		extractedData,
		displayName: 'mismatch.pdf', fileKey: 'mismatch.pdf',
		restaurantId: rid, batchId: 'mismatch-batch-1', id: 'mismatch-item-1',
	});
}

function mismatchForm(opts: { invoiceNumber: string; totalAmount: string; lineTotal: string; supplier?: string }): FormData {
	const fd = new FormData();
	const fields = {
		supplier_name: opts.supplier ?? '__inv_total_mismatch_sup__',
		invoice_number: opts.invoiceNumber,
		invoice_date: '2024-03-01',
		total_amount: opts.totalAmount,
		line_descriptions: 'Producto de prueba',
		line_quantities: '1',
		line_units: 'ud',
		line_unit_prices: opts.lineTotal,
		line_total_prices: opts.lineTotal,
		line_tax_rates: '',
	};
	for (const [key, value] of Object.entries(fields)) fd.append(key, value);
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
): Promise<{ reviewState: string; incidenceKind: string | null }> {
	const out = await saveReviewedInvoice(mismatchFakeItem(extractedData), mismatchForm(formOpts), rid);
	expect(out.type).toBe('saved');
	if (out.type !== 'saved') throw new Error('unreachable — asserted above');

	const [invoiceRow] = await testSql`
		SELECT review_state, incidence_kind FROM invoices WHERE id = ${out.invoiceId}`;
	return { reviewState: invoiceRow.review_state, incidenceKind: invoiceRow.incidence_kind };
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → extraction-time total_mismatch signal (issue #808)', () => {
	it('marks the invoice incidencia (kind lectura) when the extraction flagged a mismatch, even though the unedited submission reconciles', async () => {
		// The reviewer accepted the extraction as-is: the submitted line total
		// and total_amount agree with each other (100 == 100), so a check
		// recomputed only from the submission would pass — but the extraction
		// step itself had already detected the raw lines didn't add up, e.g.
		// because Gemini's own tax fallback force-reconciled the gap.
		const { reviewState, incidenceKind } = await saveAndGetReviewState(
			{ confidence: 1, total_mismatch: true },
			{ invoiceNumber: 'FAC-808-001', totalAmount: '100.00', lineTotal: '100.00' },
		);
		expect(reviewState).toBe('incidencia');
		expect(incidenceKind).toBe('lectura');
	});

	it('still marks incidencia (kind lectura) when the reviewer submits a fresh mismatch, independent of the extraction-time flag', async () => {
		const { reviewState, incidenceKind } = await saveAndGetReviewState(
			{ confidence: 1, total_mismatch: false },
			{ invoiceNumber: 'FAC-808-002', totalAmount: '100.00', lineTotal: '40.00' },
		);
		expect(reviewState).toBe('incidencia');
		expect(incidenceKind).toBe('lectura');
	});

	it('is revisado, with no incidence kind, when neither the extraction nor the submission show a mismatch', async () => {
		const { reviewState, incidenceKind } = await saveAndGetReviewState(
			{ confidence: 1, total_mismatch: false },
			{
				invoiceNumber: 'FAC-808-003',
				totalAmount: '100.00',
				lineTotal: '100.00',
				supplier: '__inv_total_mismatch_sup_clean__',
			},
		);
		expect(reviewState).toBe('revisado');
		expect(incidenceKind).toBeNull();
	});
});
