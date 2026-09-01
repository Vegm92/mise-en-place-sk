/**
 * /analytics/spend distinguishes "no invoices at all" from "invoices exist,
 * none in the selected window" (issue #539).
 *
 * The default period is 30 days (`month`, DATE_TRUNC('month')). A tenant
 * whose confirmed invoices all predate the window used to see the exact same
 * "Upload first invoice" empty state as a tenant with zero invoices — even
 * though the reminders page, and every other surface, already show their
 * data. The load now also returns the tenant's unfiltered invoice count, so
 * the two states render differently and the out-of-range one offers widening
 * the period instead of uploading.
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

const describeDb = hasDbEnv ? describe : describe.skip;

type LoadResult = {
	top_items: Array<{ description: string }>;
	category_spend: Array<{ category: string }>;
	monthly_spend: Array<{ month: string; total: number }>;
	has_invoices: boolean;
	invoices_outside_range: number;
};

async function loadSpend(rid: string, qs = ''): Promise<LoadResult> {
	const { load } = await import('../src/routes/(app)/analytics/spend/+page.server');
	return (await load({
		url: new URL(`http://localhost/analytics/spend${qs ? `?${qs}` : ''}`),
		locals: { restaurantId: rid },
	} as never)) as unknown as LoadResult;
}

async function seedOldInvoice(rid: string, supplierId: number, invoiceDate: string, number: string) {
	const [inv] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
		VALUES (${rid}, ${supplierId}, ${number}, ${invoiceDate}, 90.00, 'paid') RETURNING id
	`;
	await testSql`
		INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, quantity, unit, unit_price, total_price)
		VALUES (${rid}, ${inv.id}, 'Tomate pera', 10, 'kg', 9.00, 90.00)
	`;
}

describeDb('/analytics/spend load() — no data vs none in range (issue #539)', () => {
	let ridEmpty = '';
	let ridOutOfRange = '';

	// Well outside the default 30-day/month window, comfortably inside the
	// 6-month ("half") window — avoids flaking on exact-boundary math.
	const fiveMonthsAgo = new Date();
	fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);
	const oldDate = fiveMonthsAgo.toISOString().slice(0, 10);

	beforeAll(async () => {
		if (!hasDbEnv) return;
		ridEmpty = (await createTestRestaurant('spend-empty')).id;
		ridOutOfRange = (await createTestRestaurant('spend-outofrange')).id;

		const [supplier] = await testSql`
			INSERT INTO suppliers (restaurant_id, name, category)
			VALUES (${ridOutOfRange}, 'Frutas Gómez', 'Frutas y Verduras') RETURNING id
		`;
		await seedOldInvoice(ridOutOfRange, Number(supplier.id), oldDate, 'OLD-1');
		await seedOldInvoice(ridOutOfRange, Number(supplier.id), oldDate, 'OLD-2');
		await seedOldInvoice(ridOutOfRange, Number(supplier.id), oldDate, 'OLD-3');

		await testSql`SELECT refresh_analytics_rollups()`;
	});

	afterAll(async () => {
		if (!hasDbEnv) return;
		await cleanupTestRestaurant(ridEmpty);
		await cleanupTestRestaurant(ridOutOfRange);
		await closeDb();
	});

	it('a tenant with zero invoices gets the original empty state, no widen flag', async () => {
		const res = await loadSpend(ridEmpty);
		expect(res.top_items).toHaveLength(0);
		expect(res.has_invoices).toBe(false);
		expect(res.invoices_outside_range).toBe(0);
	});

	it('a tenant whose invoices all predate the default 30-day window is flagged out-of-range, not data-less', async () => {
		const res = await loadSpend(ridOutOfRange);
		expect(res.top_items).toHaveLength(0);
		expect(res.has_invoices).toBe(true);
		expect(res.invoices_outside_range).toBe(3);
	});

	it('widening to period=all surfaces the same invoices and clears the out-of-range flag', async () => {
		const res = await loadSpend(ridOutOfRange, 'period=all');
		expect(res.top_items.length).toBeGreaterThan(0);
		expect(res.has_invoices).toBe(true);
		expect(res.invoices_outside_range).toBe(0);
	});

	it('a window that actually covers the invoices shows data with no out-of-range flag', async () => {
		const res = await loadSpend(ridOutOfRange, 'period=6m');
		expect(res.top_items.length).toBeGreaterThan(0);
		expect(res.invoices_outside_range).toBe(0);
	});

	it('monthly_spend always covers the last 12 months, current month included, independent of the period filter (issue #882)', async () => {
		const short = await loadSpend(ridOutOfRange);
		const wide = await loadSpend(ridOutOfRange, 'period=all');
		expect(short.monthly_spend).toHaveLength(12);
		expect(wide.monthly_spend).toEqual(short.monthly_spend);

		const now = new Date();
		const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
		expect(short.monthly_spend[short.monthly_spend.length - 1].month).toBe(currentMonth);

		const oldMonth = oldDate.slice(0, 7);
		const oldMonthRow = short.monthly_spend.find(m => m.month === oldMonth);
		expect(oldMonthRow?.total).toBeCloseTo(270, 2);
	});

	it('an empty tenant still gets 12 zero-valued months, not an empty array (issue #882)', async () => {
		const res = await loadSpend(ridEmpty);
		expect(res.monthly_spend).toHaveLength(12);
		expect(res.monthly_spend.every(m => m.total === 0)).toBe(true);
	});
});
