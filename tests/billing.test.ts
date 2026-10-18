/**
 * Multi-tier billing — feature gating + plan resolution (Starter/Pro/Business).
 *
 * The pure decision logic is what gates paid features and trial access, so it is
 * tested in isolation: db is mocked away (the module imports the db singleton,
 * which would otherwise throw without DATABASE_URL) and the Stripe price IDs are
 * injected via process.env so TIERS has a known mapping to assert.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { setLocale, t, loadAllMessages } from '../src/lib/i18n';
import { untranslated } from './helpers/i18n-setup';

await loadAllMessages();

const originalEnv = { ...process.env };

vi.hoisted(() => {
	process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
	process.env.STRIPE_PRICE_ID_STARTER = 'price_starter';
	process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
	process.env.STRIPE_PRICE_ID_BUSINESS = 'price_business';
	// Starter's annual price is deliberately unset: annual billing must hide itself.
	delete process.env.STRIPE_PRICE_ID_STARTER_ANNUAL;
	process.env.STRIPE_PRICE_ID_PRO_ANNUAL = 'price_pro_annual';
	process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL = 'price_business_annual';
	process.env.STRIPE_TAX_RATE_ID = 'txr_iva21';
	process.env.STRIPE_FOUNDER_COUPON_ID = 'FUNDADOR60';
});

// Sentry is mocked so the unknown-price alert can be counted: it fires on every
// /billing load while the config is wrong, and must reach Sentry only once per price id.
const sentryMocks = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@sentry/sveltekit', () => sentryMocks);

// db singleton throws at import without a connection string — stub it out.
// `subscriptionRow` is what getAccessState reads; set it per test.
const { subscriptionRow } = vi.hoisted(() => ({ subscriptionRow: { value: null as unknown } }));
vi.mock('$lib/server/db', async () => {
	const { chainableQuery } = await import('./helpers/mock-chain');
	const chain = chainableQuery(() => (subscriptionRow.value ? [subscriptionRow.value] : []));
	return {
		db: { select: chain, update: chain, insert: chain, $count: () => Promise.resolve(0) },
		forTenant: () => ({ scope: () => ({}) }),
		runAsSystem: (fn: () => unknown) => fn(),
		runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn(),
	};
});

// Mock the Stripe client so switchTier can be exercised without the network:
// retrieve returns the subscription item id, update records the price swap.
vi.mock('stripe', () => {
	const subscriptions = { retrieve: vi.fn(), update: vi.fn() };
	const checkout = { sessions: { create: vi.fn() } };
	class StripeInvalidRequestError extends Error {
		code?: string;
		param?: string;
		constructor(raw: { code?: string; param?: string }) {
			super('stripe invalid request');
			Object.assign(this, raw);
		}
	}
	return {
		default: class {
			static errors = { StripeInvalidRequestError };
			subscriptions = subscriptions;
			checkout = checkout;
		},
	};
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
	createCheckoutSession,
	founderDiscount,
	intervalFromPriceId,
	isAnnualBillingAvailable,
	isMissingCustomerError,
	subscriptionMonthlyPriceCents,
	configuredPriceIdSet,
	type PlanTier,
} from '../src/lib/server/billing';
import {
	ANNUAL_MONTHS_BILLED,
	ANNUAL_MONTHLY_EQUIVALENT,
	ANNUAL_PRICE,
	FOUNDER_PRICE,
	PROVISIONAL_PRICE,
	TIER_MAX_LOCATIONS,
	TIER_QUOTA,
	tierPrice,
	type TierId,
} from '../src/lib/billing-plans';
import Stripe from 'stripe';

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
		expect(String(spy.mock.calls[0]![0])).toContain('price_rotated_in_dashboard');
		spy.mockRestore();
	});

	it('does not log for a configured price id', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		tierFromPriceId('price_pro');
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	// The old message only said "check STRIPE_PRICE_ID_STARTER/_PRO/_BUSINESS", which
	// leaves the operator staring at a Sentry issue with no way to tell whether the env
	// is stale, empty, or pointed somewhere else. Price ids are public (they ship in the
	// checkout session), so naming what is configured is the whole diagnosis.
	it('names the configured price ids so the mismatch is diagnosable from the alert', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		tierFromPriceId('price_unconfigured_a');
		const message = String(spy.mock.calls[0]![0]);
		expect(message).toContain('starter=price_starter');
		expect(message).toContain('pro=price_pro');
		expect(message).toContain('business=price_business');
		spy.mockRestore();
	});

	it('raises the alert to Sentry once per price id, not once per page load', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sentryMocks.captureException.mockClear();
		tierFromPriceId('price_repeated_unknown');
		tierFromPriceId('price_repeated_unknown');
		tierFromPriceId('price_repeated_unknown');
		expect(sentryMocks.captureException).toHaveBeenCalledOnce();
		expect(spy).toHaveBeenCalledTimes(3);
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
			expect(f.inventoryTemplate).toBe(false);
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
		expect(f.inventoryTemplate).toBe(true);
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

	// Issue #486: a missing subscription row used to fail OPEN (unlimited
	// free access, invisible to trial-expiry enforcement since trialEndsAt
	// stayed null). It must fail closed instead — the reconciliation job
	// (billing.ts: reconcileOrphanSubscriptions) is what heals a legitimate
	// gap by auto-provisioning a dated trial row.
	it('denies a tenant with no subscription row at all, rather than failing open', async () => {
		subscriptionRow.value = null;
		expect(await getAccessState('rest-1')).toMatchObject({ allowed: false, trialExpired: true });
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

	// An annual subscriber who changes tier stays annual rather than being moved
	// to the monthly price of the new tier behind their back.
	it('keeps the billing interval of the subscription it switches', async () => {
		vi.mocked(stripe!.subscriptions.retrieve).mockResolvedValue({
			items: { data: [{ id: 'item_1', price: { id: 'price_pro_annual' } }] },
		} as never);

		subscriptionRow.value = { stripeSubscriptionId: 'sub_3', planTier: 'pro' };
		await switchTier('rest-1', 'business');
		expect(stripe!.subscriptions.update).toHaveBeenCalledWith('sub_3', {
			items: [{ id: 'item_1', price: 'price_business_annual' }],
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

// docs/02_product/pricing_decision_2026-10.md — the launch table. Every number
// the public page, /billing and /admin/revenue show is derived from these, so
// they are pinned here rather than re-derived.
describe('launch price table (pricing decision 2026-10)', () => {
	const tiers: TierId[] = ['starter', 'pro', 'business'];

	it('lists 69 / 139 / 299 € a month, and the annual price is ten months of it', () => {
		expect(PROVISIONAL_PRICE).toEqual({ starter: 69, pro: 139, business: 299 });
		expect(ANNUAL_PRICE).toEqual({ starter: 690, pro: 1390, business: 2990 });
		for (const tier of tiers) {
			expect(ANNUAL_PRICE[tier]).toBe(PROVISIONAL_PRICE[tier] * ANNUAL_MONTHS_BILLED);
			expect(tierPrice(tier, 'month')).toBe(PROVISIONAL_PRICE[tier]);
			expect(tierPrice(tier, 'year')).toBe(ANNUAL_PRICE[tier]);
		}
		expect(ANNUAL_MONTHLY_EQUIVALENT).toEqual({ starter: 57.5, pro: 115.83, business: 249.17 });
	});

	// The waitlist told every sign-up that the price it showed (29 / 59 / 129)
	// would stay frozen for life. The founder coupon is what keeps that promise
	// under the new list price, so it must never price a founder above it.
	it('keeps every founder price at or below what the waitlist promised', () => {
		const promised: Record<TierId, number> = { starter: 29, pro: 59, business: 129 };
		expect(FOUNDER_PRICE).toEqual({ starter: 27.6, pro: 55.6, business: 119.6 });
		for (const tier of tiers) expect(FOUNDER_PRICE[tier]).toBeLessThanOrEqual(promised[tier]);
	});

	it('feeds TIERS its quotas and location caps from billing-plans.ts', () => {
		for (const tier of tiers) {
			expect(TIERS[tier].monthlyInvoiceQuota).toBe(TIER_QUOTA[tier]);
			expect(TIERS[tier].maxLocations).toBe(TIER_MAX_LOCATIONS[tier]);
		}
		expect(TIERS.pro.monthlyInvoiceQuota).toBe(400);
	});

	// A group of 2–10 restaurants must land on Business: Pro covers one
	// restaurant, so any second location forces the top tier, and the top tier
	// has room for ten.
	it('sizes Business for a 2–10-location group and keeps Pro single-location', () => {
		expect(TIERS.pro.maxLocations).toBe(1);
		expect(TIERS.starter.maxLocations).toBe(1);
		expect(TIERS.business.maxLocations).toBe(10);
		expect(TIERS.business.features.multiLocation).toBe(true);
	});
});

describe('annual billing', () => {
	it('maps the annual price id to the same tier, without an unknown-price alert', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(tierFromPriceId('price_pro_annual')).toBe('pro');
		expect(tierFromPriceId('price_business_annual')).toBe('business');
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it('tells the interval from the price id', () => {
		expect(intervalFromPriceId('price_pro_annual')).toBe('year');
		expect(intervalFromPriceId('price_pro')).toBe('month');
		expect(intervalFromPriceId(null)).toBe('month');
		expect(intervalFromPriceId('price_unknown')).toBe('month');
	});

	it('prices an annual subscription at a twelfth of the annual price for MRR', () => {
		expect(planMonthlyPriceCents('business', 'year')).toBe(Math.round((ANNUAL_PRICE.business * 100) / 12));
		expect(subscriptionMonthlyPriceCents('business', 'price_business_annual')).toBe(24917);
		expect(subscriptionMonthlyPriceCents('pro', 'price_pro')).toBe(PROVISIONAL_PRICE.pro * 100);
		expect(planMonthlyPriceCents('trial', 'year')).toBe(0);
	});

	it('hides annual billing until every paid tier has an annual price', () => {
		expect(isTierAvailable('pro', 'year')).toBe(true);
		expect(isTierAvailable('starter', 'year')).toBe(false);
		expect(isTierAvailable('starter', 'month')).toBe(true);
		expect(isAnnualBillingAvailable()).toBe(false);
	});

	it('counts annual price ids as configured, so revenue leaks do not flag them', () => {
		const ids = configuredPriceIdSet();
		expect(ids.has('price_pro_annual')).toBe(true);
		expect(ids.has('price_pro')).toBe(true);
		expect(ids.has('')).toBe(false);
	});
});

describe('createCheckoutSession', () => {
	const create = () => vi.mocked(stripe!.checkout.sessions.create);
	const base = { restaurantId: 'rest-1', customerId: 'cus_1', successUrl: 'https://s', cancelUrl: 'https://c' };

	afterEach(() => create().mockReset());

	it('checks out the annual price with IVA as the default tax rate', async () => {
		create().mockResolvedValue({ url: 'https://checkout.stripe.test/a' } as never);
		subscriptionRow.value = { founder: false };
		const url = await createCheckoutSession({ ...base, tier: 'pro', interval: 'year' });
		expect(url).toBe('https://checkout.stripe.test/a');
		const params = create().mock.calls[0]![0]!;
		expect(params.line_items).toEqual([{ price: 'price_pro_annual', quantity: 1 }]);
		expect(params.subscription_data?.default_tax_rates).toEqual(['txr_iva21']);
		expect(params.allow_promotion_codes).toBe(true);
		expect(params.discounts).toBeUndefined();
	});

	it('defaults to the monthly price', async () => {
		create().mockResolvedValue({ url: 'https://checkout.stripe.test/m' } as never);
		subscriptionRow.value = { founder: false };
		await createCheckoutSession({ ...base, tier: 'business' });
		expect(create().mock.calls[0]![0]!.line_items).toEqual([{ price: 'price_business', quantity: 1 }]);
	});

	it('refuses an interval whose price is not configured, naming the variable', async () => {
		await expect(createCheckoutSession({ ...base, tier: 'starter', interval: 'year' }))
			.rejects.toThrow(/STRIPE_PRICE_ID_STARTER_ANNUAL not configured/);
		expect(create()).not.toHaveBeenCalled();
	});

	// The env var is named, and documented, as a coupon id. It used to be passed
	// as `promotion_code`, which Stripe rejects for a coupon id — every founder
	// checkout would have failed.
	it('applies the founder coupon as a coupon, with the founder trial', async () => {
		create().mockResolvedValue({ url: 'https://checkout.stripe.test/f' } as never);
		subscriptionRow.value = { founder: true };
		await createCheckoutSession({ ...base, tier: 'business' });
		const params = create().mock.calls[0]![0]!;
		expect(params.discounts).toEqual([{ coupon: 'FUNDADOR60' }]);
		expect(params.allow_promotion_codes).toBeUndefined();
		expect(params.subscription_data?.trial_period_days).toBe(30);
	});

	it('accepts a promotion-code id in the same variable', () => {
		expect(founderDiscount('promo_1AbC')).toEqual({ promotion_code: 'promo_1AbC' });
		expect(founderDiscount('FUNDADOR60')).toEqual({ coupon: 'FUNDADOR60' });
	});

	// Only a missing customer means a stale customer id. A missing price or
	// coupon is a config error, and treating it as a stale customer used to
	// mint a fresh Stripe customer on every retry.
	it('treats only a missing customer as a stale customer', () => {
		const Err = (Stripe as unknown as { errors: { StripeInvalidRequestError: new (raw: object) => Error } }).errors.StripeInvalidRequestError;
		expect(isMissingCustomerError(new Err({ code: 'resource_missing', param: 'customer' }))).toBe(true);
		expect(isMissingCustomerError(new Err({ code: 'resource_missing' }))).toBe(true);
		expect(isMissingCustomerError(new Err({ code: 'resource_missing', param: 'discounts[0][coupon]' }))).toBe(false);
		expect(isMissingCustomerError(new Err({ code: 'parameter_invalid', param: 'customer' }))).toBe(false);
		expect(isMissingCustomerError(new Error('network'))).toBe(false);
	});
});

describe('plan display names go through the i18n table (follow-up to #661)', () => {
  const order: PlanTier[] = ['trial', 'starter', 'pro', 'business'];
  const tr = (key: string) => t(key);

  afterEach(() => setLocale('es'));

  it('gives every tier an i18n key for its display name', () => {
    for (const tier of order) {
      expect(TIERS[tier].nameKey, tier).toMatch(/^billing\.plan\./);
    }
  });

  it('resolves every tier name key in both locales', () => {
    expect(untranslated(order.map((tier) => TIERS[tier].nameKey))).toEqual([]);
  });

  it('translates the trial plan instead of showing Spanish to English readers', () => {
    setLocale('es');
    expect(tr(TIERS.trial.nameKey)).toBe('Prueba gratuita');
    setLocale('en');
    expect(tr(TIERS.trial.nameKey)).toBe('Free trial');
  });

  it('keeps Starter/Pro/Business identical in both locales — they are brand names', () => {
    for (const tier of ['starter', 'pro', 'business'] as PlanTier[]) {
      setLocale('es');
      const es = tr(TIERS[tier].nameKey);
      setLocale('en');
      expect(tr(TIERS[tier].nameKey)).toBe(es);
      expect(es).toBe(TIERS[tier].name);
    }
  });

  it('leaves no Spanish prose in the tier config — name is a storage token', () => {
    for (const tier of order) {
      expect(TIERS[tier].name, tier).not.toMatch(/[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/);
    }
    expect(readFileSync(new URL('../src/lib/server/billing.ts', import.meta.url), 'utf-8'))
      .not.toContain('Prueba gratuita');
  });

  it('still stores the language-neutral name, so plan_name stays stable', () => {
    expect(TIERS.starter.name).toBe('Starter');
    expect(TIERS.pro.name).toBe('Pro');
    expect(TIERS.business.name).toBe('Business');
  });

  it('hands the client a key, never a rendered plan name', () => {
    const loaders = [
      '../src/routes/(app)/+layout.server.ts',
      '../src/routes/(app)/billing/+page.server.ts',
      '../src/routes/(app)/billing/confirm/+page.server.ts',
    ];
    for (const rel of loaders) {
      const source = readFileSync(new URL(rel, import.meta.url), 'utf-8');
      expect(source, rel).toMatch(/nameKey/);
      expect(source, rel).not.toMatch(/\b(planName|currentTierName):/);
      expect(source, rel).not.toMatch(/\bname: config\.name\b/);
    }
  });
});
