/**
 * runPostSaveEffects used to run every non-fatal side effect (product
 * linking, alerts, the invoice_saved event, extraction-correction logging,
 * the onboarding flag) inside ONE try/catch. A throw partway through — say,
 * a budget-check query blowing up — silently skipped everything after it,
 * including extraction-correction logging (what /analytics/extraction reads)
 * and the onboarding flag, with only a console.error to show for it.
 *
 * Each effect is now isolated: one failing must not stop the others from
 * running. This forces runBudgetCheck to throw and checks that the effects
 * ordered after it in the source (extraction-correction logging, the
 * onboarding flag) still ran.
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

const { runBudgetCheckMock } = vi.hoisted(() => ({
	runBudgetCheckMock: vi.fn(async () => {
		throw new Error('boom: simulated budget check failure');
	}),
}));

vi.mock('../src/lib/server/alerts', async () => {
	const actual = await vi.importActual<typeof import('../src/lib/server/alerts')>(
		'../src/lib/server/alerts',
	);
	return { ...actual, runBudgetCheck: runBudgetCheckMock };
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

function baseForm(): FormData {
	const fd = new FormData();
	fd.append('supplier_name', '__post_save_isolation_sup__');
	fd.append('invoice_number', 'RIGHT-1');
	fd.append('invoice_date', '2026-07-20');
	fd.append('total_amount', '12.00');
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', 'Tomate Pera');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'kg');
	fd.append('line_unit_prices', '12.00');
	fd.append('line_total_prices', '12.00');
	fd.append('line_tax_rates', '');
	return fd;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('post-save-isolation');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('runPostSaveEffects isolation', () => {
	it('still logs extraction corrections and sets the onboarding flag when an earlier effect throws', async () => {
		const item = fakeItem({
			supplier_name: '__post_save_isolation_sup__',
			invoice_number: 'WRONG-1',
			invoice_date: '2026-07-20',
			total_amount: 12,
			confidence: 0.95,
			field_confidences: { invoice_number: 0.4 },
		});
		const fd = baseForm();

		const out = await saveReviewedInvoice(item, fd, rid);

		expect(runBudgetCheckMock).toHaveBeenCalled();
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		// The invoice's own row committed regardless — that was never in
		// question. What the isolation fix guarantees is that effects ordered
		// AFTER the throwing one still ran.
		expect(out.isFirstInvoice).toBe(true);

		const settingsRows = await testSql<Array<{ value: string }>>`
			SELECT value FROM settings
			WHERE restaurant_id = ${rid} AND key = 'has_completed_onboarding'
		`;
		expect(settingsRows[0]?.value).toBe('true');

		const correctionRows = await testSql<Array<{ field_name: string; corrected_value: string | null }>>`
			SELECT field_name, corrected_value FROM extraction_corrections
			WHERE restaurant_id = ${rid} AND invoice_id = ${out.invoiceId}
		`;
		expect(correctionRows.some((r) => r.field_name === 'invoice_number' && r.corrected_value === 'right-1')).toBe(true);
	});
});
