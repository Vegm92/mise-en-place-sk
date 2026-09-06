/**
 * The metered unit and its ledger (ADR-036).
 *
 * One number gates the plan and one number is displayed, and they are the same
 * number: documents put through extraction this month. `monthly_usage.used` is
 * the fast counter, `usage_events` the append-only trail it is a sum of, and
 * every test here asserts the pair stays consistent — because the bug this
 * replaces was precisely two counters disagreeing in silence.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

// The plan limit is the one thing these tests vary; billing itself is covered
// by tests/billing.test.ts.
const { planLimit } = vi.hoisted(() => ({ planLimit: { value: null as number | null } }));
vi.mock('../src/lib/server/billing', () => ({
	getMonthlyQuota: async () => planLimit.value,
}));

import { testSql, cleanupTestRestaurant, createTestRestaurant, hasDbEnv } from './helpers/test-db';
import {
	attributeReservation, claimMonthlyExtraction, getMonthlyUsage,
	releaseMonthlyExtraction, reserveMonthlyExtractions,
} from '../src/lib/server/llm-quota';
import { isRefundableOnCancel } from '../src/lib/server/batch';

let rid = '';
const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER_ITEM = '22222222-2222-4222-8222-222222222222';

/** What the ledger says the tenant has spent, independent of the counter. */
async function ledgerTotal(): Promise<number> {
	const [row] = await testSql`
		SELECT COALESCE(SUM(delta), 0)::int AS total
		FROM usage_events
		WHERE restaurant_id = ${rid} AND month = to_char(now(), 'YYYY-MM')`;
	return row!.total;
}

async function expectConsistent(used: number) {
	expect(await getMonthlyUsage(rid)).toBe(used);
	expect(await ledgerTotal()).toBe(used);
}

beforeEach(async () => {
	if (!hasDbEnv) return;
	if (rid) await cleanupTestRestaurant(rid);
	rid = (await createTestRestaurant('usage-ledger')).id;
	planLimit.value = 10;
});

afterAll(async () => {
	if (hasDbEnv) await (await import('./helpers/test-db')).closeDb();
});

describe.skipIf(!hasDbEnv)('claiming a slot', () => {
	it('counts one document and records why', async () => {
		expect(await claimMonthlyExtraction(rid, ITEM)).toEqual({ claimed: true });
		await expectConsistent(1);

		const [event] = await testSql`SELECT kind, delta, reason FROM usage_events WHERE batch_item_id = ${ITEM}`;
		expect(event).toMatchObject({ kind: 'claim', delta: 1, reason: 'extraction' });
	});

	it('charges a redelivered job once, not once per delivery', async () => {
		await claimMonthlyExtraction(rid, ITEM);
		await claimMonthlyExtraction(rid, ITEM);
		await claimMonthlyExtraction(rid, ITEM);

		await expectConsistent(1);
	});

	it('refuses once the plan limit is reached, without moving the counter', async () => {
		planLimit.value = 2;
		await claimMonthlyExtraction(rid, ITEM);
		await claimMonthlyExtraction(rid, OTHER_ITEM);

		const third = await claimMonthlyExtraction(rid, '33333333-3333-4333-8333-333333333333');

		expect(third).toEqual({ claimed: false, reason: 'monthly_plan_limit', limit: 2 });
		await expectConsistent(2);
	});

	it('still counts an unlimited tenant, so their counter is not a permanent zero', async () => {
		planLimit.value = null;

		expect(await claimMonthlyExtraction(rid, ITEM)).toEqual({ claimed: true });
		await expectConsistent(1);
	});

	it('lets a released item claim again, so a retry is not a free extraction', async () => {
		await claimMonthlyExtraction(rid, ITEM);
		await releaseMonthlyExtraction(rid, ITEM, 'extract.err.timeout');
		await expectConsistent(0);

		expect(await claimMonthlyExtraction(rid, ITEM)).toEqual({ claimed: true });
		await expectConsistent(1);
	});
});

describe.skipIf(!hasDbEnv)('releasing a slot', () => {
	it('refunds exactly once however many times cancel is pressed', async () => {
		await claimMonthlyExtraction(rid, ITEM);
		await releaseMonthlyExtraction(rid, ITEM, 'discarded');
		await releaseMonthlyExtraction(rid, ITEM, 'discarded');
		await releaseMonthlyExtraction(rid, ITEM, 'discarded');

		await expectConsistent(0);
	});

	it('refunds nothing for an item that never claimed', async () => {
		await releaseMonthlyExtraction(rid, ITEM, 'discarded');
		await expectConsistent(0);
	});

	it('never takes the counter below zero', async () => {
		await releaseMonthlyExtraction(rid, undefined, 'stray');
		expect(await getMonthlyUsage(rid)).toBe(0);
	});
});

describe.skipIf(!hasDbEnv)('reserving a composite document', () => {
	it('buys the whole packet in one step', async () => {
		expect(await reserveMonthlyExtractions(rid, 7)).toEqual({ reserved: true });
		await expectConsistent(7);
	});

	it('refuses a packet larger than what is left, and spends nothing', async () => {
		planLimit.value = 10;
		await reserveMonthlyExtractions(rid, 8);

		const second = await reserveMonthlyExtractions(rid, 17);

		expect(second).toEqual({ reserved: false, remaining: 2, limit: 10 });
		await expectConsistent(8);
	});

	it('leaves the counter alone when the reservation is attributed to its children', async () => {
		await reserveMonthlyExtractions(rid, 2);
		await attributeReservation(rid, [ITEM, OTHER_ITEM]);

		await expectConsistent(2);
	});

	it('does not charge a pre-paid child again when it comes to be extracted', async () => {
		await reserveMonthlyExtractions(rid, 2);
		await attributeReservation(rid, [ITEM, OTHER_ITEM]);

		expect(await claimMonthlyExtraction(rid, ITEM)).toEqual({ claimed: true });
		expect(await claimMonthlyExtraction(rid, OTHER_ITEM)).toEqual({ claimed: true });

		await expectConsistent(2);
	});

	it('refunds one slot when one pre-paid child is cancelled', async () => {
		await reserveMonthlyExtractions(rid, 2);
		await attributeReservation(rid, [ITEM, OTHER_ITEM]);

		await releaseMonthlyExtraction(rid, ITEM, 'discarded');

		await expectConsistent(1);
	});
});

describe('what cancelling refunds', () => {
	it('gives the slot back for an item that never reached the extractor', () => {
		expect(isRefundableOnCancel('pending')).toBe(true);
		expect(isRefundableOnCancel('queued')).toBe(true);
		expect(isRefundableOnCancel('failed')).toBe(true);
	});

	it('keeps the slot once the model has run, whether or not an invoice was saved', () => {
		// The whole basis for metering on extraction: discarding a result the
		// provider was already paid for does not un-spend it.
		expect(isRefundableOnCancel('done')).toBe(false);
		expect(isRefundableOnCancel('confirmed')).toBe(false);
	});

	it('leaves an in-flight item to the worker', () => {
		expect(isRefundableOnCancel('extracting')).toBe(false);
	});
});
