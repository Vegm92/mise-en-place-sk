/**
 * /analytics/extraction — regression guard for issue #539.
 *
 * #539 reported that /analytics/spend, /analytics/extraction and /dashboard
 * all showed "no data yet, upload your first invoice" to tenants who already
 * had confirmed invoices, because each was gated on a date-windowed count
 * rather than an unfiltered one.
 *
 * /analytics/extraction turns out not to share the bug: its KPIs come from
 * `mv_extraction_stats`, which is one row per invoice with NO date filter at
 * all (see drizzle/0005_analytics_rollups.sql) — the empty-state gate
 * (`hasData = total_invoices > 0`) is already the tenant's all-time count.
 * These tests pin that: an invoice dated months in the past still renders
 * normally, and only a truly invoice-less tenant sees the upload prompt.
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

const describeDb = hasDbEnv ? describe : describe.skip;

type LoadResult = {
	hasData: boolean;
	kpis: { total_invoices: number; auto_confirmed: number; auto_confirmed_rate: number | null };
};

async function loadExtraction(rid: string): Promise<LoadResult> {
	const { load } = await import('../src/routes/(app)/analytics/extraction/+page.server');
	return (await load({
		url: new URL('http://localhost/analytics/extraction'),
		locals: { restaurantId: rid },
	} as never)) as unknown as LoadResult;
}

describeDb('/analytics/extraction load() — already unwindowed (issue #539)', () => {
	let ridEmpty = '';
	let ridOld = '';

	const oldDate = (() => {
		const d = new Date();
		d.setMonth(d.getMonth() - 5);
		return d.toISOString().slice(0, 10);
	})();

	beforeAll(async () => {
		if (!hasDbEnv) return;
		ridEmpty = (await createTestRestaurant('extract-empty')).id;
		ridOld = (await createTestRestaurant('extract-old')).id;

		const [supplier] = await testSql`
			INSERT INTO suppliers (restaurant_id, name, category)
			VALUES (${ridOld}, 'Pescados Ruiz', 'Pescados y Mariscos') RETURNING id
		`;
		await testSql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
			VALUES (${ridOld}, ${supplier!.id}, 'OLD-1', ${oldDate}, 60.00, 'paid')
		`;

		await testSql`SELECT refresh_analytics_rollups()`;
	});

	afterAll(async () => {
		if (!hasDbEnv) return;
		await cleanupTestRestaurant(ridEmpty);
		await cleanupTestRestaurant(ridOld);
		await closeDb();
	});

	it('a tenant with zero invoices sees the empty state', async () => {
		const res = await loadExtraction(ridEmpty);
		expect(res.hasData).toBe(false);
		expect(res.kpis.total_invoices).toBe(0);
	});

	it('a confirmed invoice from months ago still counts — no date window to fall outside of', async () => {
		const res = await loadExtraction(ridOld);
		expect(res.hasData).toBe(true);
		expect(res.kpis.total_invoices).toBe(1);
		expect(res.kpis.auto_confirmed).toBe(1);
		expect(res.kpis.auto_confirmed_rate).toBe(100);
	});
});
