/**
 * Multi-tier billing — feature gating + plan resolution (Starter/Pro/Business).
 *
 * The pure decision logic is what gates paid features and trial access, so it is
 * tested in isolation: db is mocked away (the module imports the db singleton,
 * which would otherwise throw without DATABASE_URL) and the Stripe price IDs are
 * injected via a mocked $env so tierFromPriceId has a known mapping to assert.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		STRIPE_PRICE_ID_STARTER: 'price_starter',
		STRIPE_PRICE_ID_PRO: 'price_pro',
		STRIPE_PRICE_ID_BUSINESS: 'price_business',
		// no STRIPE_SECRET_KEY → stripe stays null, module is a safe no-op
	},
}));

// db singleton throws at import without a connection string — stub it out.
vi.mock('../src/lib/server/db', () => ({ db: {} }));

import {
	TIERS,
	tierFromPriceId,
	isAccessAllowed,
	isTierAvailable,
	resolveMonthlyQuota,
	UNLIMITED_QUOTA_SETTING,
	type PlanTier,
} from '../src/lib/server/billing';

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
		}
	});

	it('pro unlocks analytics features but not multi-location/priority support', () => {
		const f = TIERS.pro.features;
		expect(f.weeklyDigest).toBe(true);
		expect(f.stockTracking).toBe(true);
		expect(f.supplierScores).toBe(true);
		expect(f.multiLocation).toBe(false);
		expect(f.prioritySupport).toBe(false);
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
