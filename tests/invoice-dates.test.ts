/**
 * date-typed invoice columns (issue #516).
 *
 * invoice_date / due_date were `text`, written straight from the form and
 * compared lexicographically everywhere. That is only correct for zero-padded
 * ISO strings: "2026-1-5" sorts after "2026-12-01", and "05/01/2026" sorts
 * before every ISO date so it reads as permanently overdue.
 *
 * These tests pin both halves of the fix — the write-boundary rejection, and
 * the real `date` column behaving as a date in range comparisons.
 *
 * The DB-backed half skips without DATABASE_URL, like the other DB suites.
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
import { toIsoDate, isBlankOrIsoDate, toMonthKey } from '../src/lib/server/dates';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';
import type { BatchItem } from '../src/lib/server/batch';
import { fakeBatchItem } from './helpers/batch-item';

describe('toIsoDate', () => {
	it('accepts zero-padded ISO dates', () => {
		expect(toIsoDate('2026-01-05')).toBe('2026-01-05');
		expect(toIsoDate('  2026-12-31  ')).toBe('2026-12-31');
		expect(toIsoDate('2024-02-29')).toBe('2024-02-29');
	});

	it('rejects the formats that sort wrong as text', () => {
		expect(toIsoDate('2026-1-5')).toBeNull();
		expect(toIsoDate('05/01/2026')).toBeNull();
		expect(toIsoDate('5 enero 2026')).toBeNull();
		expect(toIsoDate('20260105')).toBeNull();
	});

	it('rejects dates that do not exist on the calendar', () => {
		expect(toIsoDate('2026-02-30')).toBeNull();
		expect(toIsoDate('2025-02-29')).toBeNull();
		expect(toIsoDate('2026-13-01')).toBeNull();
		expect(toIsoDate('2026-00-10')).toBeNull();
	});

	it('treats blank as absent, not invalid', () => {
		expect(toIsoDate('')).toBeNull();
		expect(toIsoDate('   ')).toBeNull();
		expect(toIsoDate(null)).toBeNull();
		expect(isBlankOrIsoDate('')).toBe(true);
		expect(isBlankOrIsoDate(null)).toBe(true);
		expect(isBlankOrIsoDate('2026-01-05')).toBe(true);
		expect(isBlankOrIsoDate('05/01/2026')).toBe(false);
	});
});

describe('toMonthKey', () => {
	it('accepts YYYY-MM only', () => {
		expect(toMonthKey('2026-01')).toBe('2026-01');
		expect(toMonthKey('2026-1')).toBeNull();
		expect(toMonthKey('2026-13')).toBeNull();
		expect(toMonthKey('2026-01-05')).toBeNull();
	});
});

let rid = '';

function fakeItem(): BatchItem {
	return fakeBatchItem({
		id: 'item-dates-1',
		batchId: 'batch-dates-1',
		restaurantId: rid,
	});
}

function form(opts: { invoiceNumber: string; invoiceDate?: string; dueDate?: string }): FormData {
	const fd = new FormData();
	fd.append('supplier_name', '__inv_dates_sup__');
	fd.append('invoice_number', opts.invoiceNumber);
	if (opts.invoiceDate !== undefined) fd.append('invoice_date', opts.invoiceDate);
	if (opts.dueDate !== undefined) fd.append('due_date', opts.dueDate);
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
	const r = await createTestRestaurant('inv-dates');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	if (rid) await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('invoice date write boundary', () => {
	it('rejects a non-ISO invoice_date and writes nothing', async () => {
		const outcome = await saveReviewedInvoice(fakeItem(), form({ invoiceNumber: 'DATE-BAD-1', invoiceDate: '05/01/2026' }), rid);
		expect(outcome).toEqual({ type: 'invalidDate', field: 'invoice_date' });

		const rows = await testSql`SELECT id FROM invoices WHERE restaurant_id = ${rid} AND invoice_number = 'DATE-BAD-1'`;
		expect(rows).toHaveLength(0);
	});

	it('rejects a non-ISO due_date and writes nothing', async () => {
		const outcome = await saveReviewedInvoice(
			fakeItem(),
			form({ invoiceNumber: 'DATE-BAD-2', invoiceDate: '2026-01-05', dueDate: '2026-1-5' }),
			rid
		);
		expect(outcome).toEqual({ type: 'invalidDate', field: 'due_date' });

		const rows = await testSql`SELECT id FROM invoices WHERE restaurant_id = ${rid} AND invoice_number = 'DATE-BAD-2'`;
		expect(rows).toHaveLength(0);
	});

	it('accepts an ISO date and stores it as a real date column', async () => {
		const outcome = await saveReviewedInvoice(
			fakeItem(),
			form({ invoiceNumber: 'DATE-OK-1', invoiceDate: '2026-01-05', dueDate: '2026-02-04' }),
			rid
		);
		expect(outcome.type).toBe('saved');

		const [col] = await testSql`
			SELECT data_type FROM information_schema.columns
			WHERE table_name = 'invoices' AND column_name = 'invoice_date'
		`;
		expect(col.data_type).toBe('date');

		const [row] = await testSql`
			SELECT invoice_date::text AS invoice_date, due_date::text AS due_date FROM invoices
			WHERE restaurant_id = ${rid} AND invoice_number = 'DATE-OK-1'
		`;
		expect(row.invoice_date).toBe('2026-01-05');
		expect(row.due_date).toBe('2026-02-04');
	});

	it('orders by calendar date, not by string', async () => {
		await saveReviewedInvoice(fakeItem(), form({ invoiceNumber: 'DATE-OK-2', invoiceDate: '2026-12-01' }), rid);
		await saveReviewedInvoice(fakeItem(), form({ invoiceNumber: 'DATE-OK-3', invoiceDate: '2027-01-05' }), rid);

		const rows = await testSql<{ invoice_number: string }[]>`
			SELECT invoice_number FROM invoices
			WHERE restaurant_id = ${rid} AND invoice_number IN ('DATE-OK-1', 'DATE-OK-2', 'DATE-OK-3')
			ORDER BY invoice_date ASC
		`;
		expect(rows.map((r) => r.invoice_number))
			.toEqual(['DATE-OK-1', 'DATE-OK-2', 'DATE-OK-3']);
	});

	it('refuses a non-ISO date at the database level too', async () => {
		await expect(
			testSql`UPDATE invoices SET invoice_date = '2026-13-45' WHERE restaurant_id = ${rid} AND invoice_number = 'DATE-OK-1'`
		).rejects.toThrow();
	});
});

describe.skipIf(!hasDbEnv)('month key constraints', () => {
	it('rejects a malformed month on category_budgets', async () => {
		await expect(
			testSql`INSERT INTO category_budgets (restaurant_id, category, month, monthly_budget) VALUES (${rid}, 'test', '2026-1', 100)`
		).rejects.toThrow();
	});

	it('accepts a well-formed month', async () => {
		await testSql`INSERT INTO category_budgets (restaurant_id, category, month, monthly_budget) VALUES (${rid}, 'test', '2026-01', 100)`;
		const rows = await testSql`SELECT month FROM category_budgets WHERE restaurant_id = ${rid}`;
		expect(rows).toHaveLength(1);
	});
});
