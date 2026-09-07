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
import { invoiceAuditLog } from '../src/lib/server/schema';
import type { BatchItem } from '../src/lib/server/batch';
import { fakeBatchItem } from './helpers/batch-item';

let rid = '';
const uid = randomUUID();

const fakeItem = (overrides: Partial<BatchItem> = {}): BatchItem =>
	fakeBatchItem({ restaurantId: rid, ...overrides });

function form(invoiceNumber: string): FormData {
	const fd = new FormData();
	fd.append('supplier_name', '__inv_audit_sup__');
	fd.append('invoice_number', invoiceNumber);
	fd.append('invoice_date', '2024-01-15');
	fd.append('total_amount', '100.00');
	fd.append('low_confidence_ack', 'true');
	fd.append('line_descriptions', 'Producto de prueba');
	fd.append('line_quantities', '1');
	fd.append('line_units', 'ud');
	fd.append('line_unit_prices', '100.00');
	fd.append('line_total_prices', '100.00');
	fd.append('line_tax_rates', '');
	return fd;
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
		const item = fakeItem({ fileKey: 'factura-audit-1.pdf' });
		const out = await saveReviewedInvoice(item, form('AUDIT-001'), rid, uid);
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const rows = await testSql`
			SELECT action, restaurant_id, invoice_id, user_id, source_file
			FROM invoice_audit_log WHERE invoice_id = ${out.invoiceId}
		`;
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			action: 'create',
			restaurant_id: rid,
			invoice_id: out.invoiceId,
			user_id: uid,
			source_file: 'factura-audit-1.pdf',
		});
	});

	it('writes exactly two rows — create and confirm — for a single batch save, and never collapses to one', async () => {
		const item = fakeItem({ fileKey: 'factura-audit-3.pdf' });
		const out = await saveReviewedInvoice(item, form('AUDIT-003'), rid, uid, async (tx, invoiceId) => {
			await tx.insert(invoiceAuditLog).values({
				restaurantId: rid, invoiceId, action: 'confirm', userId: uid, sourceFile: item.fileKey,
			});
		});
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;

		const rows = await testSql`
			SELECT action, restaurant_id, invoice_id, user_id, source_file
			FROM invoice_audit_log WHERE invoice_id = ${out.invoiceId} ORDER BY action
		`;
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.action)).toEqual(['confirm', 'create']);
		for (const row of rows) {
			expect(row).toMatchObject({
				restaurant_id: rid,
				invoice_id: out.invoiceId,
				user_id: uid,
				source_file: 'factura-audit-3.pdf',
			});
		}
	});
});
