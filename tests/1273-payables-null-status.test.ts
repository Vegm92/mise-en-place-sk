/**
 * RULE-354: the payables report lists what is still owed. A paid invoice drops
 * off; a pending one stays. A NULL status used to vanish because
 * `NULL <> 'paid'` is not true in SQL — an unmarked invoice is unpaid, so it
 * must show.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('$lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testSql, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { buildPayables } from '../src/lib/server/reports/payables';

const describeDb = hasDbEnv ? describe : describe.skip;
const TODAY = '2026-06-15';

let rid = '';

async function insertInvoice(number: string, status: string | null, deleted = false) {
	await testSql`
		INSERT INTO invoices (restaurant_id, invoice_number, invoice_date, due_date, total_amount, status, deleted_at)
		VALUES (${rid}, ${number}, '2026-05-01', '2026-06-01', 100, ${status}, ${deleted ? new Date().toISOString() : null})`;
}

async function listedNumbers(): Promise<string[]> {
	const doc = await buildPayables(rid, TODAY, new Date(`${TODAY}T10:00:00Z`));
	return doc.csv.rows.map((r) => String(r[1])).sort();
}

describeDb('payables selection (RULE-354)', () => {
	beforeAll(async () => {
		rid = (await createTestRestaurant('payables-null')).id;
		await insertInvoice('PENDING', 'pending');
		await insertInvoice('PAID', 'paid');
		await insertInvoice('NULL-STATUS', null);
		await insertInvoice('DELETED', 'pending', true);
	});

	afterAll(async () => {
		await cleanupTestRestaurant(rid);
	});

	it('keeps a pending invoice and drops a paid one', async () => {
		const numbers = await listedNumbers();
		expect(numbers).toContain('PENDING');
		expect(numbers).not.toContain('PAID');
	});

	it('still hides soft-deleted invoices', async () => {
		expect(await listedNumbers()).not.toContain('DELETED');
	});

	it('treats a null status as unpaid and lists it', async () => {
		expect(await listedNumbers()).toContain('NULL-STATUS');
	});
});
