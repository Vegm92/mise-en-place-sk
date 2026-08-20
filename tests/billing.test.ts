/**
 * Multi-tier billing — feature gating + plan resolution (Starter/Pro/Business).
 *
 * The pure decision logic is what gates paid features and trial access, so it is
 * tested in isolation: db is mocked away (the module imports the db singleton,
 * which would otherwise throw without DATABASE_URL) and the Stripe price IDs are
 * injected via process.env so TIERS has a known mapping to assert.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const originalEnv = { ...process.env };

vi.hoisted(() => {
	process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
	process.env.STRIPE_PRICE_ID_STARTER = 'price_starter';
	process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
	process.env.STRIPE_PRICE_ID_BUSINESS = 'price_business';
});

// db singleton throws at import without a connection string — stub it out.
// `subscriptionRow` is what getAccessState reads; set it per test.
const { subscriptionRow } = vi.hoisted(() => ({ subscriptionRow: { value: null as unknown } }));
vi.mock('../src/lib/server/db', () => {
	const chain = () => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'limit', 'update', 'set', 'insert', 'values', 'onConflictDoUpdate', 'returning']) p[m] = () => p;
		p.then = (res: (v: unknown) => unknown) =>
			Promise.resolve(subscriptionRow.value ? [subscriptionRow.value] : []).then(res);
		return p;
	};
	return { db: { select: chain, update: chain, insert: chain }, forTenant: () => ({ scope: () => ({}) }) };
});

// Mock the Stripe client so switchTier can be exercised without the network:
// retrieve returns the subscription item id, update records the price swap.
vi.mock('stripe', () => {
	const subscriptions = { retrieve: vi.fn(), update: vi.fn() };
	return { default: class { subscriptions = subscriptions; } };
});

import {
	getAccessState,
	TIERS,
	tierFromPriceId,
	isAccessAllowed,
	isTierAvailable,
	effectiveTier,
	planMonthlyPriceCents,
	resolveMonthlyQuota,
	switchTier,
	stripe,
	UNLIMITED_QUOTA_SETTING,
	type PlanTier,
} from '../src/lib/server/billing';
import { PROVISIONAL_PRICE } from '../src/lib/billing-plans';

// The revenue console prices MRR off this function, so a drift between the
// published price table and what admin reports would misstate every downstream
// metric (ARPA, ACV, LTV). No PLAN_PRICE_* override is mocked above, so these
// assert the published fallback.
describe('planMonthlyPriceCents', () => {
	it('prices each paid tier from the published table, in cents', () => {
		expect(planMonthlyPriceCents('starter')).toBe(PROVISIONAL_PRICE.starter * 100);
		expect(planMonthlyPriceCents('pro')).toBe(PROVISIONAL_PRICE.pro * 100);
		expect(planMonthlyPriceCents('business')).toBe(PROVISIONAL_PRICE.business * 100);
	});

	it('prices a trial at zero so trials never inflate MRR', () => {
		expect(planMonthlyPriceCents('trial')).toBe(0);
	});
});

describe('tierFromPriceId', () => {
	it('maps each configured price id to its tier', () => {
		expect(tierFromPriceId('price_starter')).toBe('starter');
		expect(tierFromPriceId('price_pro')).toBe('pro');
		expect(tierFromPriceId('price_business')).toBe('business');
	});

	it('returns trial for null/undefined/empty (no subscription yet)', () => {
		expect(tierFromPriceId(null)).toBe('trial');
		expect(tierFromPriceId(undefined)).toBe('trial');
		expect(tierFromPriceId('')).toBe('trial');
	});

	it('falls back to starter for an unknown/legacy price id', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(tierFromPriceId('price_legacy_unknown')).toBe('starter');
		spy.mockRestore();
	});

	// Issue #286: the fallback silently quota'd Pro/Business customers as
	// starter. It still falls back (a subscription must resolve to something)
	// but must be loud about it.
	it('logs an error when a price id matches no configured tier', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		tierFromPriceId('price_rotated_in_dashboard');
		expect(spy).toHaveBeenCalledOnce();
		expect(String(spy.mock.calls[0][0])).toContain('price_rotated_in_dashboard');
		spy.mockRestore();
	});

	it('does not log for a configured price id', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		tierFromPriceId('price_pro');
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe('isTierAvailable', () => {
	it('is true for tiers with a configured Stripe price id', () => {
		expect(isTierAvailable('starter')).toBe(true);
		expect(isTierAvailable('pro')).toBe(true);
		expect(isTierAvailable('business')).toBe(true);
	});

	it('is false for the trial tier, which is never checked out', () => {
		expect(isTierAvailable('trial')).toBe(false);
	});
});

// Issue #295 — one convention for "no quota configured", replacing the three
// that used to disagree (layout: 150, upload gate: unlimited, settings: 99999).
describe('resolveMonthlyQuota', () => {
	it('returns the stored positive limit', () => {
		expect(resolveMonthlyQuota('300', 'pro')).toBe(300);
	});

	it('treats the unlimited sentinel as unlimited', () => {
		expect(resolveMonthlyQuota(UNLIMITED_QUOTA_SETTING, 'business')).toBeNull();
	});

	it('treats the legacy 99999 magic number as unlimited', () => {
		expect(resolveMonthlyQuota('99999', 'business')).toBeNull();
	});

	it('falls back to the tier quota when the row is missing or unparseable', () => {
		expect(resolveMonthlyQuota(null, 'trial')).toBe(TIERS.trial.monthlyInvoiceQuota);
		expect(resolveMonthlyQuota(undefined, 'starter')).toBe(TIERS.starter.monthlyInvoiceQuota);
		expect(resolveMonthlyQuota('', 'pro')).toBe(TIERS.pro.monthlyInvoiceQuota);
		expect(resolveMonthlyQuota('not-a-number', 'pro')).toBe(TIERS.pro.monthlyInvoiceQuota);
		expect(resolveMonthlyQuota('0', 'pro')).toBe(TIERS.pro.monthlyInvoiceQuota);
		expect(resolveMonthlyQuota('-5', 'pro')).toBe(TIERS.pro.monthlyInvoiceQuota);
	});

	it('falls back to unlimited for an unlimited tier with no row', () => {
		expect(resolveMonthlyQuota(null, 'business')).toBeNull();
	});
});

describe('isAccessAllowed', () => {
	const future = new Date(Date.now() + 86_400_000);
	const past = new Date(Date.now() - 86_400_000);

	it('allows any active subscription regardless of trial date', () => {
		expect(isAccessAllowed('active', null)).toBe(true);
		expect(isAccessAllowed('active', past)).toBe(true);
	});

	it('allows a trial that has not yet expired', () => {
		expect(isAccessAllowed('trialing', future)).toBe(true);
	});

	it('denies an expired trial', () => {
		expect(isAccessAllowed('trialing', past)).toBe(false);
	});

	it('denies a trial with no end date', () => {
		expect(isAccessAllowed('trialing', null)).toBe(false);
	});

	it('denies past_due, canceled, and incomplete', () => {
		expect(isAccessAllowed('past_due', future)).toBe(false);
		expect(isAccessAllowed('canceled', future)).toBe(false);
		expect(isAccessAllowed('incomplete', future)).toBe(false);
	});
});

describe('effectiveTier', () => {
	const future = new Date(Date.now() + 86_400_000);
	const past = new Date(Date.now() - 86_400_000);

	it('keeps the paid tier while the subscription is live', () => {
		expect(effectiveTier({ planTier: 'pro', status: 'active', trialEndsAt: null })).toBe('pro');
		expect(effectiveTier({ planTier: 'business', status: 'past_due', trialEndsAt: null })).toBe('business');
	});

	it('drops to trial when the subscription is no longer paying', () => {
		for (const status of ['canceled', 'paused', 'incomplete']) {
			expect(effectiveTier({ planTier: 'pro', status, trialEndsAt: null })).toBe('trial');
		}
	});

	it('drops to trial once the trial has expired', () => {
		expect(effectiveTier({ planTier: 'pro', status: 'trialing', trialEndsAt: past })).toBe('trial');
		expect(effectiveTier({ planTier: 'pro', status: 'trialing', trialEndsAt: future })).toBe('pro');
	});

	it('treats a missing subscription as trial', () => {
		expect(effectiveTier(undefined)).toBe('trial');
		expect(effectiveTier({ planTier: null, status: 'active', trialEndsAt: null })).toBe('trial');
	});
});

describe('TIERS configuration', () => {
	const order: PlanTier[] = ['trial', 'starter', 'pro', 'business'];

	it('defines exactly the four expected tiers', () => {
		expect(Object.keys(TIERS).sort()).toEqual([...order].sort());
	});

	it('every tier has a human name and a features object', () => {
		for (const tier of order) {
			expect(TIERS[tier].name).toBeTruthy();
			expect(TIERS[tier].features).toBeTypeOf('object');
		}
	});

	it('invoice quotas increase by tier, with business unlimited', () => {
		expect(TIERS.trial.monthlyInvoiceQuota).toBeLessThan(TIERS.starter.monthlyInvoiceQuota!);
		expect(TIERS.starter.monthlyInvoiceQuota!).toBeLessThan(TIERS.pro.monthlyInvoiceQuota!);
		expect(TIERS.business.monthlyInvoiceQuota).toBeNull(); // unlimited
	});

	it('trial and starter gate all premium features off', () => {
		for (const tier of ['trial', 'starter'] as PlanTier[]) {
			const f = TIERS[tier].features;
			expect(f.weeklyDigest).toBe(false);
			expect(f.stockTracking).toBe(false);
			expect(f.supplierScores).toBe(false);
			expect(f.multiLocation).toBe(false);
			expect(f.prioritySupport).toBe(false);
			expect(f.aiAssistant).toBe(false);
		}
	});

	it('pro unlocks analytics features and the AI assistant but not multi-location/priority support', () => {
		const f = TIERS.pro.features;
		expect(f.weeklyDigest).toBe(true);
		expect(f.stockTracking).toBe(true);
		expect(f.supplierScores).toBe(true);
		expect(f.multiLocation).toBe(false);
		expect(f.prioritySupport).toBe(false);
		expect(f.aiAssistant).toBe(true);
	});

	it('business unlocks every feature', () => {
		const f = TIERS.business.features;
		expect(Object.values(f).every(Boolean)).toBe(true);
	});

	it('feature access never regresses as tier increases', () => {
		const featureKeys = Object.keys(TIERS.business.features) as (keyof typeof TIERS.business.features)[];
		for (const key of featureKeys) {
			let seenEnabled = false;
			for (const tier of order) {
				const enabled = TIERS[tier].features[key];
				if (seenEnabled) {
					expect(enabled, `${key} regressed at ${tier}`).toBe(true);
				}
				if (enabled) seenEnabled = true;
			}
		}
	});
});

// Issue #287 — trial expiry is enforced, so "may this tenant spend?" has to be
// answerable from the subscription row alone.
describe('getAccessState', () => {
	const future = new Date(Date.now() + 86_400_000);
	const past = new Date(Date.now() - 86_400_000);

	it('allows a live trial', async () => {
		subscriptionRow.value = { status: 'trialing', trialEndsAt: future };
		expect(await getAccessState('rest-1')).toMatchObject({ allowed: true, trialExpired: false });
	});

	it('flags a lapsed trial specifically', async () => {
		subscriptionRow.value = { status: 'trialing', trialEndsAt: past };
		expect(await getAccessState('rest-1')).toMatchObject({ allowed: false, trialExpired: true });
	});

	it('blocks a cancelled subscription without calling it a trial', async () => {
		subscriptionRow.value = { status: 'canceled', trialEndsAt: null };
		expect(await getAccessState('rest-1')).toMatchObject({ allowed: false, trialExpired: false });
	});

	it('allows an active subscription', async () => {
		subscriptionRow.value = { status: 'active', trialEndsAt: null };
		expect(await getAccessState('rest-1')).toMatchObject({ allowed: true });
	});

	it('does not lock out a tenant with no subscription row at all', async () => {
		subscriptionRow.value = null;
		expect(await getAccessState('rest-1')).toMatchObject({ allowed: true });
	});
});

afterEach(() => {
	process.env = { ...originalEnv };
	vi.mocked(stripe!.subscriptions.retrieve).mockReset();
	vi.mocked(stripe!.subscriptions.update).mockReset();
});

// In-app plan change: one subscription, price swapped on it (any tier ↔ any
// paid tier), upgrades pro-rate in Stripe, downgrades apply immediately.
describe('switchTier', () => {
	it('swaps the price on the existing subscription and clears a pending cancel', async () => {
		vi.mocked(stripe!.subscriptions.retrieve).mockResolvedValue({ items: { data: [{ id: 'item_1' }] } } as never);
		vi.mocked(stripe!.subscriptions.update).mockResolvedValue({} as never);

		subscriptionRow.value = { stripeSubscriptionId: 'sub_1', planTier: 'starter' };
		await switchTier('rest-1', 'pro');

		expect(stripe!.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
		expect(stripe!.subscriptions.update).toHaveBeenCalledWith('sub_1', {
			items: [{ id: 'item_1', price: TIERS.pro.stripePriceId }],
			cancel_at_period_end: false,
		});
	});

	it('supports downgrades and business moves on the same subscription', async () => {
		vi.mocked(stripe!.subscriptions.retrieve).mockResolvedValue({ items: { data: [{ id: 'item_1' }] } } as never);

		subscriptionRow.value = { stripeSubscriptionId: 'sub_2', planTier: 'business' };
		await switchTier('rest-1', 'starter');
		expect(stripe!.subscriptions.update).toHaveBeenCalledWith('sub_2', {
			items: [{ id: 'item_1', price: TIERS.starter.stripePriceId }],
			cancel_at_period_end: false,
		});
	});

	it('refuses to switch to a tier with no configured price id', async () => {
		subscriptionRow.value = { stripeSubscriptionId: 'sub_1' };
		await expect(switchTier('rest-1', 'trial')).rejects.toThrow(/not configured/);
		expect(stripe!.subscriptions.update).not.toHaveBeenCalled();
	});

	it('refuses to switch when no subscription exists', async () => {
		subscriptionRow.value = null;
		await expect(switchTier('rest-1', 'pro')).rejects.toThrow(/No subscription to switch/);
		expect(stripe!.subscriptions.update).not.toHaveBeenCalled();
	});
});
