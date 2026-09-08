/**
 * invoice_audit_log coverage for issue #993: saveReviewedInvoice's insert of
 * the invoice itself must land in the same transaction as a 'create' audit
 * row, and the batch save action's confirm write (passed in via onSaved,
 * inside that same transaction) must land its own 'confirm' row — so neither
 * can diverge from the write it describes.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped without
 * DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', () => import('./helpers/mock-db'));

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { saveReviewedInvoice, type SaveOutcome } from '../src/lib/server/invoice-save';
import { invoiceAuditLog } from '../src/lib/server/schema';
import { minimalInvoiceForm, minimalBatchItem } from './helpers/invoice-save-form';

let rid = '';
const uid = randomUUID();

function assertSaved(out: SaveOutcome): asserts out is Extract<SaveOutcome, { type: 'saved' }> {
	expect(out.type).toBe('saved');
	if (out.type !== 'saved') throw new Error(`expected a saved outcome, got ${out.type}`);
}

async function auditRowsFor(invoiceId: number) {
	return testSql`
		SELECT action, restaurant_id, invoice_id, user_id, source_file
		FROM invoice_audit_log WHERE invoice_id = ${invoiceId} ORDER BY action
	`;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('audit-log');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → invoice_audit_log (issue #993)', () => {
	it('writes a create row carrying restaurantId, invoiceId, userId and sourceFile', async () => {
		const item = minimalBatchItem(rid, null);
		const out = await saveReviewedInvoice(item, minimalInvoiceForm('__inv_audit_sup__', 'AUDIT-001'), rid, uid);
		assertSaved(out);

		const rows = await auditRowsFor(out.invoiceId);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			action: 'create',
			restaurant_id: rid,
			invoice_id: out.invoiceId,
			user_id: uid,
			source_file: item.fileKey,
		});
	});

	it('writes exactly two rows — create and confirm — for a single batch save, and never collapses to one', async () => {
		const item = minimalBatchItem(rid, null);
		const out = await saveReviewedInvoice(
			item, minimalInvoiceForm('__inv_audit_sup__', 'AUDIT-002'), rid, uid,
			async (tx, invoiceId) => {
				await tx.insert(invoiceAuditLog).values({
					restaurantId: rid, invoiceId, action: 'confirm', userId: uid, sourceFile: item.fileKey,
				});
			},
		);
		assertSaved(out);

		const rows = await auditRowsFor(out.invoiceId);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.action)).toEqual(['confirm', 'create']);
		for (const row of rows) {
			expect(row).toMatchObject({
				restaurant_id: rid,
				invoice_id: out.invoiceId,
				user_id: uid,
				source_file: item.fileKey,
			});
		}
	});
});
