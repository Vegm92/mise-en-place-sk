/**
 * /dashboard — the month-scoped pace card distinguishes "no invoices at all"
 * from "invoices exist, none in the selected month" (issue #539).
 *
 * The dashboard's spend-this-month figure is scoped to `selectedMonth`
 * (defaults to the current calendar month). A tenant whose confirmed
 * invoices all fall in earlier months used to see the exact same "no spend
 * recorded — upload an invoice" copy as a tenant with zero invoices. The
 * load now also returns the tenant's invoice count outside the selected
 * month, so the pace rail can tell the two apart and point at /invoices
 * (unfiltered by date) instead of prompting an upload.
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { toMonthStr, shiftMonth } from '../src/lib/formatters';

const describeDb = hasDbEnv ? describe : describe.skip;

type LoadResult = {
	mom: { this_month: number };
	invoices_outside_month: number;
};

async function loadDashboard(rid: string, qs = ''): Promise<LoadResult> {
	const { load } = await import('../src/routes/(app)/dashboard/+page.server');
	return (await load({
		url: new URL(`http://localhost/dashboard${qs ? `?${qs}` : ''}`),
		locals: { restaurantId: rid },
	} as never)) as unknown as LoadResult;
}

describeDb('/dashboard load() — no data vs none this month (issue #539)', () => {
	let ridEmpty = '';
	let ridOtherMonth = '';

	const currentMonth = toMonthStr(new Date());
	const pastMonth = shiftMonth(currentMonth, -4);
	const pastMonthDate = `${pastMonth}-10`;

	beforeAll(async () => {
		if (!hasDbEnv) return;
		ridEmpty = (await createTestRestaurant('dash-empty')).id;
		ridOtherMonth = (await createTestRestaurant('dash-othermonth')).id;

		const [supplier] = await testSql`
			INSERT INTO suppliers (restaurant_id, name, category)
			VALUES (${ridOtherMonth}, 'Carnicas Soto', 'Carnes') RETURNING id
		`;
		await testSql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
			VALUES
				(${ridOtherMonth}, ${supplier.id}, 'PM-1', ${pastMonthDate}, 150.00, 'paid'),
				(${ridOtherMonth}, ${supplier.id}, 'PM-2', ${pastMonthDate}, 210.00, 'paid')
		`;
	});

	afterAll(async () => {
		if (!hasDbEnv) return;
		await cleanupTestRestaurant(ridEmpty);
		await cleanupTestRestaurant(ridOtherMonth);
		await closeDb();
	});

	it('a tenant with zero invoices has nothing outside the month either', async () => {
		const res = await loadDashboard(ridEmpty);
		expect(res.mom.this_month).toBe(0);
		expect(res.invoices_outside_month).toBe(0);
	});

	it('a tenant whose invoices are all in an earlier month is flagged, not data-less', async () => {
		const res = await loadDashboard(ridOtherMonth);
		expect(res.mom.this_month).toBe(0);
		expect(res.invoices_outside_month).toBe(2);
	});

	it('navigating to the month the invoices are actually in clears the flag and shows the spend', async () => {
		const res = await loadDashboard(ridOtherMonth, `month=${pastMonth}`);
		expect(res.mom.this_month).toBe(360);
		expect(res.invoices_outside_month).toBe(0);
	});
});
