/**
 * How STRIPE_PRICE_ID_* is read into TIERS, and what the app says when a live
 * subscription's price matches none of it.
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

vi.mock('../src/lib/server/db', () => {
	const chain = () => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'leftJoin', 'where', 'limit', 'update', 'set', 'insert', 'values', 'onConflictDoUpdate', 'returning']) p[m] = () => p;
		p.then = (res: (v: unknown) => unknown) => Promise.resolve([]).then(res);
		return p;
	};
	return { db: { select: chain, update: chain, insert: chain }, forTenant: () => ({ scope: () => ({}) }) };
});

vi.mock('stripe', () => ({ default: class {} }));

import { TIERS, tierFromPriceId, isTierAvailable } from '../src/lib/server/billing';

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
});

describe('tierFromPriceId diagnosis', () => {
	it('calls out a Stripe account mismatch when the live price is from another account', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(tierFromPriceId(OTHER_ACCOUNT_PRICE)).toBe('starter');
		const message = String(spy.mock.calls[0][0]);
		expect(message).toContain('different Stripe accounts');
		expect(message).toContain('BzHhtWXhWL');
		expect(message).toContain(ACCOUNT_A);
		spy.mockRestore();
	});

	it('tags the alert so an account mismatch is filterable in Sentry', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		sentryMocks.captureException.mockClear();
		tierFromPriceId('price_1U3ZZzBzHhtWXhWLQq8vNe1P');
		expect(sentryMocks.captureException.mock.calls[0][1]).toMatchObject({
			tags: { area: 'billing', billingConfig: 'stripe_account_mismatch' },
		});
		spy.mockRestore();
	});

	// A rotated price on the *right* account is a different fix (update the env var),
	// so it must not be reported as an account mismatch.
	it('does not claim an account mismatch for a rotated price on the same account', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		tierFromPriceId(`price_1U9ZZz${ACCOUNT_A}Qq8vNe1P`);
		expect(String(spy.mock.calls[0][0])).not.toContain('different Stripe accounts');
		spy.mockRestore();
	});
});
