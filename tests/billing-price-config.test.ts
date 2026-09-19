/**
 * How STRIPE_PRICE_ID_* is read into TIERS, that the admin Stripe probe reads the
 * very same value (issue #1075), and what the app says when a live subscription's
 * price matches none of it.
 *
 * Separate from billing.test.ts because both concerns are decided at module import:
 * TIERS captures process.env once, and the account-mismatch diagnosis only means
 * anything against realistically shaped Stripe ids (`price_1` + 5 random chars + a
 * 10-char account fragment), where billing.test.ts deliberately uses short fakes.
 */
import { describe, it, expect, vi } from 'vitest';

// Two ids from the same Stripe account (…Qvt7HEh0RX) and one from another (…BzHhtWXhWL),
// mirroring the production incident: the key was rotated to a new account, the price ids
// were not, and every /billing load resolved the live subscription to the wrong tier.
// vi.hoisted runs before any const in this file is initialized, so the ids are written
// out literally there and re-declared below for the assertions to read.
vi.hoisted(() => {
	process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
	// Starter deliberately unset: the legacy single-price var must still cover it.
	delete process.env.STRIPE_PRICE_ID_STARTER;
	// Padded on purpose — a value pasted into a deploy console keeps its trailing newline.
	process.env.STRIPE_PRICE_ID = '  price_1U8UaaQvt7HEh0RXcD1gYnQ4\n';
	process.env.STRIPE_PRICE_ID_PRO = 'price_1U8UWuQvt7HEh0RXaT4eZjF8';
	process.env.STRIPE_PRICE_ID_BUSINESS = ' price_1U9QQbQvt7HEh0RXbK7fXmR2 ';
});

const ACCOUNT_A = 'Qvt7HEh0RX';
const STARTER_PRICE = 'price_1U8UaaQvt7HEh0RXcD1gYnQ4';
const PRO_PRICE = 'price_1U8UWuQvt7HEh0RXaT4eZjF8';
const BUSINESS_PRICE = 'price_1U9QQbQvt7HEh0RXbK7fXmR2';
const OTHER_ACCOUNT_PRICE = 'price_1U2AtnBzHhtWXhWLTZxwEx2L';

const sentryMocks = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@sentry/sveltekit', () => sentryMocks);

vi.mock('$lib/server/db', async () => {
	const { chainableQuery } = await import('./helpers/mock-chain');
	const chain = chainableQuery();
	return { db: { select: chain, update: chain, insert: chain }, forTenant: () => ({ scope: () => ({}) }) };
});

// `prices.retrieve` is the one Stripe call the admin probe makes; capturing its
// argument is how the test sees which id the probe path actually used.
const stripeMocks = vi.hoisted(() => ({
	retrievePrice: vi.fn(async (id: string) => ({ id, unit_amount: 4900, currency: 'eur', livemode: false })),
}));
vi.mock('stripe', () => ({
	default: class {
		prices = { retrieve: stripeMocks.retrievePrice };
	},
}));

import { TIERS, tierFromPriceId, isTierAvailable } from '../src/lib/server/billing';
import { STRIPE_PRICE_ID, STRIPE_PRICE_ID_PRO, STRIPE_PRICE_ID_BUSINESS } from '../src/lib/server/env';
import { probeStripe, resetProbeCache } from '../src/lib/server/external-probes';

describe('STRIPE_PRICE_ID_* → TIERS', () => {
	// `process.env.X ?? ''` is never nullish, so the documented `?? STRIPE_PRICE_ID`
	// fallback was dead code: starter silently got '' and matched no subscription.
	it('falls back to the legacy STRIPE_PRICE_ID when the starter var is unset', () => {
		expect(TIERS.starter.stripePriceId).toBe(STARTER_PRICE);
		expect(isTierAvailable('starter')).toBe(true);
	});

	// A trailing newline survives a copy-paste into a deploy console and turns every
	// exact-match lookup into a miss — invisible in the dashboard, fatal at runtime.
	it('trims surrounding whitespace off each price id', () => {
		expect(TIERS.pro.stripePriceId).toBe(PRO_PRICE);
		expect(TIERS.business.stripePriceId).toBe(BUSINESS_PRICE);
		expect(tierFromPriceId(BUSINESS_PRICE)).toBe('business');
	});

	// Issue #1075: billing.ts trimmed its own copy of the env while env.ts exported
	// the raw value, so the padded id worked for checkout and failed in the probe.
	// env.ts is now the only reader, so the trim has to be visible on its exports.
	it('exports the trimmed ids from env.ts, the single reader of STRIPE_PRICE_ID_*', () => {
		expect(STRIPE_PRICE_ID).toBe(STARTER_PRICE);
		expect(STRIPE_PRICE_ID_PRO).toBe(PRO_PRICE);
		expect(STRIPE_PRICE_ID_BUSINESS).toBe(BUSINESS_PRICE);
	});
});

describe('admin Stripe probe (issue #1075)', () => {
	it('retrieves the same trimmed starter price that checkout uses, legacy fallback included', async () => {
		resetProbeCache();
		stripeMocks.retrievePrice.mockClear();
		const result = await probeStripe();
		expect(stripeMocks.retrievePrice).toHaveBeenCalledWith(STARTER_PRICE);
		expect(result.state).toBe('ok');
		expect(result.detail).toContain('49.00 EUR');
	});

	// The incident shape itself: STRIPE_PRICE_ID_STARTER pasted with a trailing
	// newline. Both readers are re-evaluated so the assertion covers the probe path
	// reading env.ts, not a value cached at first import.
	it('tolerates a padded STRIPE_PRICE_ID_STARTER on the probe path', async () => {
		const padded = 'price_1U8UbbQvt7HEh0RXeF2gHnR5';
		process.env.STRIPE_PRICE_ID_STARTER = `${padded}\n`;
		vi.resetModules();
		try {
			const env = await import('../src/lib/server/env');
			expect(env.STRIPE_PRICE_ID_STARTER).toBe(padded);
			const probes = await import('../src/lib/server/external-probes');
			probes.resetProbeCache();
			stripeMocks.retrievePrice.mockClear();
			const result = await probes.probeStripe();
			expect(stripeMocks.retrievePrice).toHaveBeenCalledWith(padded);
			expect(result.state).toBe('ok');
		} finally {
			delete process.env.STRIPE_PRICE_ID_STARTER;
			vi.resetModules();
		}
	});
});

describe('tierFromPriceId diagnosis', () => {
	it('calls out a Stripe account mismatch when the live price is from another account', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(tierFromPriceId(OTHER_ACCOUNT_PRICE)).toBe('starter');
		const message = String(spy.mock.calls[0]![0]);
		expect(message).toContain('different Stripe accounts');
		expect(message).toContain('BzHhtWXhWL');
		expect(message).toContain(ACCOUNT_A);
		spy.mockRestore();
	});

	it('tags the alert so an account mismatch is filterable in Sentry', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sentryMocks.captureException.mockClear();
		tierFromPriceId('price_1U3ZZzBzHhtWXhWLQq8vNe1P');
		expect(sentryMocks.captureException.mock.calls[0]![1]).toMatchObject({
			tags: { area: 'billing', billingConfig: 'stripe_account_mismatch' },
		});
		spy.mockRestore();
	});

	// A rotated price on the *right* account is a different fix (update the env var),
	// so it must not be reported as an account mismatch.
	it('does not claim an account mismatch for a rotated price on the same account', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		tierFromPriceId(`price_1U9ZZz${ACCOUNT_A}Qq8vNe1P`);
		expect(String(spy.mock.calls[0]![0])).not.toContain('different Stripe accounts');
		spy.mockRestore();
	});
});

// Issue #1075: the once-per-price-id dedupe above is right for a /billing page that
// re-resolves the same stale config on every load, but wrong for a paying customer
// whose subscription just got written down to starter — every such write is its own
// incident and must reach Sentry with the subscription it happened to.
describe('tierFromPriceId on a paying subscription (issue #1075)', () => {
	const unknown = `price_1U7QQq${ACCOUNT_A}Zz9yMk3T`;

	it('reports every paying subscription individually, carrying subscription and price ids', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sentryMocks.captureException.mockClear();
		expect(tierFromPriceId(unknown, { subscriptionId: 'sub_a', status: 'active', restaurantId: 'rest_a' })).toBe('starter');
		expect(tierFromPriceId(unknown, { subscriptionId: 'sub_b', status: 'past_due' })).toBe('starter');
		expect(sentryMocks.captureException).toHaveBeenCalledTimes(2);
		expect(sentryMocks.captureException.mock.calls[0]![1]).toMatchObject({
			level: 'error',
			tags: { area: 'billing', op: 'paid_tier_mismatch', priceId: unknown, subscriptionStatus: 'active', billingConfig: 'price_id_unknown' },
			extra: { subscriptionId: 'sub_a', restaurantId: 'rest_a', priceId: unknown, fallbackTier: 'starter' },
		});
		expect(sentryMocks.captureException.mock.calls[1]![1]).toMatchObject({
			tags: { op: 'paid_tier_mismatch', subscriptionStatus: 'past_due' },
			extra: { subscriptionId: 'sub_b', restaurantId: null },
		});
		const logged = spy.mock.calls.map((c) => String(c[0]));
		expect(logged.some((line) => line.includes('entitlements downgraded to starter') && line.includes('sub_a'))).toBe(true);
		spy.mockRestore();
	});

	// The reconcile in (app)/+layout.server.ts re-resolves the live subscription on
	// every /billing load, so without a per-subscription dedupe a stale price id
	// would emit one Sentry event per page view — the quota burn the price-id dedupe
	// above was added for. The log line still marks every resolution.
	it('reaches Sentry once per subscription and price, while the log line marks every resolution', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sentryMocks.captureException.mockClear();
		const ctx = { subscriptionId: 'sub_repeat', status: 'active' as const, restaurantId: 'rest_r' };
		expect(tierFromPriceId(unknown, ctx)).toBe('starter');
		expect(tierFromPriceId(unknown, ctx)).toBe('starter');
		expect(tierFromPriceId(unknown, ctx)).toBe('starter');
		expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
		const logged = spy.mock.calls.map((c) => String(c[0])).filter((line) => line.includes('sub_repeat'));
		expect(logged).toHaveLength(3);
		spy.mockRestore();
	});

	it('keeps the account-mismatch diagnosis on the paying-state alert', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sentryMocks.captureException.mockClear();
		tierFromPriceId(OTHER_ACCOUNT_PRICE, { subscriptionId: 'sub_c', status: 'active' });
		expect(sentryMocks.captureException.mock.calls[0]![1]).toMatchObject({
			tags: { op: 'paid_tier_mismatch', billingConfig: 'stripe_account_mismatch' },
		});
		spy.mockRestore();
	});

	// A canceled or trialing subscription is not being billed for the wrong tier, so it
	// stays on the deduped path: still logged, still one Sentry issue per price id.
	it('stays deduped for subscriptions that are not in a paying state', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sentryMocks.captureException.mockClear();
		const rotated = `price_1U6RRr${ACCOUNT_A}Yy8xLj2S`;
		tierFromPriceId(rotated, { subscriptionId: 'sub_d', status: 'canceled' });
		tierFromPriceId(rotated, { subscriptionId: 'sub_e', status: 'trialing' });
		expect(sentryMocks.captureException).toHaveBeenCalledOnce();
		expect(sentryMocks.captureException.mock.calls[0]![1]).toMatchObject({ tags: { billingConfig: 'price_id_unknown' } });
		expect(sentryMocks.captureException.mock.calls[0]![1]).not.toMatchObject({ tags: { op: 'paid_tier_mismatch' } });
		spy.mockRestore();
	});
});
