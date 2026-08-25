/**
 * Billing round trips per request (issue #519).
 *
 * Every billing helper used to resolve the billing parent itself and then run
 * its own query, so an upload paid five round trips (access + quota) for the
 * same two rows, and a settings load another five. These assertions pin the
 * cost: one joined query per tenant, memoised for the rest of the request.
 *
 * db is mocked and counts `select()` calls; `row` is the joined result the
 * query would return (restaurants LEFT JOIN subscriptions LEFT JOIN settings).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queries, row } = vi.hoisted(() => ({
	queries: { selects: 0, leftJoins: 0, fields: [] as string[] },
	row: { value: null as Record<string, unknown> | null },
}));

vi.mock('../src/lib/server/db', () => {
	const chain = () => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'limit']) p[m] = () => p;
		p.leftJoin = () => { queries.leftJoins++; return p; };
		p.then = (res: (v: unknown) => unknown) =>
			Promise.resolve(row.value ? [row.value] : []).then(res);
		return p;
	};
	return {
		db: {
			select: (fields?: Record<string, unknown>) => {
				queries.selects++;
				queries.fields = Object.keys(fields ?? {});
				return chain();
			},
		},
		forTenant: (rid: string) => ({ rid, scope: () => ({}) }),
	};
});

vi.mock('stripe', () => ({ default: class {} }));

import {
	getAccessState,
	getEntitlements,
	getMonthlyQuota,
	getPlanTier,
	getTierFeatures,
	memoizeEntitlements,
	requireFeature,
	TIERS,
} from '../src/lib/server/billing';

const PRO_ROW = {
	billingRid: 'parent-1',
	planTier: 'pro',
	status: 'active',
	trialEndsAt: null,
	cancelAtPeriodEnd: false,
	currentPeriodEnd: null,
	quotaValue: null,
};

beforeEach(() => {
	queries.selects = 0;
	queries.leftJoins = 0;
	queries.fields = [];
	row.value = { ...PRO_ROW };
});

describe('getEntitlements', () => {
	it('resolves parent, subscription and plan quota in a single query', async () => {
		const entitlements = await getEntitlements('child-1');

		expect(queries.selects).toBe(1);
		expect(queries.leftJoins).toBe(2);
		expect(entitlements).toMatchObject({
			billingRestaurantId: 'parent-1',
			tier: 'pro',
			features: TIERS.pro.features,
			maxLocations: TIERS.pro.maxLocations,
			monthlyQuota: TIERS.pro.monthlyInvoiceQuota,
		});
		expect(entitlements.access.allowed).toBe(true);
	});

	it('reads the quota override off the joined settings row', async () => {
		row.value = { ...PRO_ROW, quotaValue: '500' };
		expect((await getEntitlements('rest-1')).monthlyQuota).toBe(500);

		row.value = { ...PRO_ROW, quotaValue: 'unlimited' };
		expect((await getEntitlements('rest-1')).monthlyQuota).toBeNull();
	});

	it('falls back to the restaurant itself when it has no row', async () => {
		row.value = null;
		const entitlements = await getEntitlements('rest-1');

		expect(queries.selects).toBe(1);
		expect(entitlements).toMatchObject({
			billingRestaurantId: 'rest-1',
			tier: 'trial',
			subscription: null,
			monthlyQuota: TIERS.trial.monthlyInvoiceQuota,
		});
	});

	it('exposes the subscription fields the app shell renders', async () => {
		const periodEnd = new Date('2026-09-01T00:00:00Z');
		row.value = { ...PRO_ROW, cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd };

		expect((await getEntitlements('rest-1')).subscription).toEqual({
			status: 'active',
			cancelAtPeriodEnd: true,
			currentPeriodEnd: periodEnd,
		});
	});
});

// Each of these is one helper a route or the worker calls on its own; the point
// is that none of them re-resolves the billing parent behind the caller's back.
describe('billing helpers', () => {
	const helpers: Array<[string, (rid: string) => Promise<unknown>]> = [
		['getMonthlyQuota', getMonthlyQuota],
		['getPlanTier', getPlanTier],
		['getTierFeatures', getTierFeatures],
		['getAccessState', getAccessState],
		['requireFeature', (rid) => requireFeature('aiAssistant', rid)],
	];

	for (const [name, call] of helpers) {
		it(`${name} costs exactly one query`, async () => {
			await call('rest-1');
			expect(queries.selects).toBe(1);
		});
	}
});

// The shapes that used to cost 5 queries each: the upload action (access +
// remaining quota) and the settings load (features + tier + billing parent).
describe('request-scoped billing context', () => {
	it('serves every caller in a request from one query', async () => {
		const entitlements = memoizeEntitlements('child-1');

		const [access, quota, features] = await Promise.all([
			entitlements().then(e => e?.access),
			entitlements().then(e => e?.monthlyQuota),
			entitlements().then(e => e?.features),
		]);
		await requireFeature('aiAssistant', { entitlements });
		await entitlements();

		expect(queries.selects).toBe(1);
		expect(access?.allowed).toBe(true);
		expect(quota).toBe(TIERS.pro.monthlyInvoiceQuota);
		expect(features).toEqual(TIERS.pro.features);
	});

	it('queries nothing for a request with no active restaurant', async () => {
		const entitlements = memoizeEntitlements(null);

		expect(await entitlements()).toBeNull();
		expect(queries.selects).toBe(0);
		await expect(requireFeature('aiAssistant', { entitlements })).rejects.toMatchObject({ status: 403 });
	});
});
