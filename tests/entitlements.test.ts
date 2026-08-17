/**
 * Entitlement gating — the decision layer behind issue #488.
 *
 * The original bug was a per-handler check: GET /api/stock-levels enforced the
 * stockTracking gate and its sibling POST did not. Enforcement now lives in one
 * handle hook keyed on event.route.id, which every request passes through
 * regardless of verb, so the durable guarantee is "this route id declares a
 * policy" rather than "this handler remembered to check". That is what these
 * tests assert, which covers verbs that do not exist yet.
 *
 * Pure functions only, matching tests/access-gate.test.ts: hooks.server.ts runs
 * Sentry.init and DB work at import time, so the wire-level outcome is expressed
 * as refusalFor() and tested here instead of through the hook.
 */
import { describe, it, expect } from 'vitest';
import {
	ROUTE_POLICY,
	REDIRECT_TARGET_ROUTES,
	UPGRADE_SLUG,
	policyFor,
	refusalFor,
	resolveEntitlement,
	type FeatureKey,
	type RoutePolicy,
} from '../src/lib/server/entitlements';
import { TIERS, type PlanTier } from '../src/lib/server/billing';

const LIVE  = { allowed: true,  trialExpired: false };
const TRIAL_OVER = { allowed: false, trialExpired: true };
const INACTIVE   = { allowed: false, trialExpired: false };

const featuresOf = (tier: PlanTier) => TIERS[tier].features;

const tiers: PlanTier[] = ['trial', 'starter', 'pro', 'business'];

describe('resolveEntitlement — open routes', () => {
	it('allows an open route regardless of tier or access', () => {
		for (const tier of tiers) {
			for (const access of [LIVE, TRIAL_OVER, INACTIVE]) {
				expect(resolveEntitlement({ policy: 'open', features: featuresOf(tier), access }))
					.toEqual({ kind: 'allow' });
			}
		}
	});
});

describe('resolveEntitlement — feature gates across every tier', () => {
	const featureKeys = Object.keys(UPGRADE_SLUG) as FeatureKey[];

	it.each(tiers)('%s gets exactly the features its tier config declares', (tier) => {
		const features = featuresOf(tier);

		for (const feature of featureKeys) {
			const decision = resolveEntitlement({ policy: { feature }, features, access: LIVE });

			expect(decision).toEqual(
				features[feature] ? { kind: 'allow' } : { kind: 'deny-feature', feature },
			);
		}
	});

	it('denies stockTracking for trial and starter, allows it for pro and business', () => {
		const policy: RoutePolicy = { feature: 'stockTracking' };

		expect(resolveEntitlement({ policy, features: featuresOf('trial'),    access: LIVE }).kind).toBe('deny-feature');
		expect(resolveEntitlement({ policy, features: featuresOf('starter'),  access: LIVE }).kind).toBe('deny-feature');
		expect(resolveEntitlement({ policy, features: featuresOf('pro'),      access: LIVE }).kind).toBe('allow');
		expect(resolveEntitlement({ policy, features: featuresOf('business'), access: LIVE }).kind).toBe('allow');
	});
});

describe('resolveEntitlement — access gates', () => {
	it('reports an expired trial before a missing feature', () => {
		const decision = resolveEntitlement({
			policy:   { feature: 'weeklyDigest', access: true },
			features: featuresOf('trial'),
			access:   TRIAL_OVER,
		});

		expect(decision).toEqual({ kind: 'deny-access', reason: 'trial' });
	});

	it('distinguishes an inactive subscription from an expired trial', () => {
		const policy: RoutePolicy = { access: true };

		expect(resolveEntitlement({ policy, features: featuresOf('pro'), access: INACTIVE }))
			.toEqual({ kind: 'deny-access', reason: 'inactive' });
		expect(resolveEntitlement({ policy, features: featuresOf('pro'), access: TRIAL_OVER }))
			.toEqual({ kind: 'deny-access', reason: 'trial' });
	});

	it('allows an entitled tenant with live access', () => {
		expect(resolveEntitlement({
			policy:   { feature: 'aiAssistant', access: true },
			features: featuresOf('pro'),
			access:   LIVE,
		})).toEqual({ kind: 'allow' });
	});

	it('does not check access on a route that does not require it', () => {
		expect(resolveEntitlement({
			policy:   { feature: 'stockTracking' },
			features: featuresOf('pro'),
			access:   INACTIVE,
		})).toEqual({ kind: 'allow' });
	});
});

describe('refusalFor — wire shape', () => {
	it('answers 402 with the contract the chat clients already parse', () => {
		const refusal = refusalFor({ kind: 'deny-feature', feature: 'aiAssistant' }, true);

		expect(refusal).toEqual({
			transport: 'api',
			status: 402,
			body: { error: 'plan_upgrade_required', feature: 'aiAssistant' },
		});
	});

	it('answers 402 trial_expired for a dead subscription on an api path', () => {
		expect(refusalFor({ kind: 'deny-access', reason: 'trial' }, true)).toEqual({
			transport: 'api',
			status: 402,
			body: { error: 'trial_expired' },
		});
	});

	it('redirects a page to /billing with a slug the billing page renders', () => {
		expect(refusalFor({ kind: 'deny-feature', feature: 'weeklyDigest' }, false)).toEqual({
			transport: 'page',
			status: 303,
			location: '/billing?upgrade=digest',
		});
		expect(refusalFor({ kind: 'deny-feature', feature: 'supplierScores' }, false)).toEqual({
			transport: 'page',
			status: 303,
			location: '/billing?upgrade=prices',
		});
		expect(refusalFor({ kind: 'deny-access', reason: 'inactive' }, false)).toEqual({
			transport: 'page',
			status: 303,
			location: '/billing?upgrade=inactive',
		});
	});

	it('is null when the decision allows', () => {
		expect(refusalFor({ kind: 'allow' }, true)).toBeNull();
		expect(refusalFor({ kind: 'allow' }, false)).toBeNull();
	});
});

describe('ROUTE_POLICY — the routes issue #488 is about', () => {
	it('gates /api/stock-levels on stockTracking for every verb', () => {
		expect(policyFor('/(app)/api/stock-levels')).toEqual({ feature: 'stockTracking' });
	});

	it('gates the digest route, covering both its load and its dismiss action', () => {
		expect(policyFor('/(app)/digest')).toEqual({ feature: 'weeklyDigest', access: true });
	});

	it('gates price analytics and the chat api', () => {
		expect(policyFor('/(app)/analytics/prices')).toEqual({ feature: 'supplierScores' });
		expect(policyFor('/(app)/api/chat')).toEqual({ feature: 'aiAssistant', access: true });
	});

	it('returns undefined for a route id that does not exist', () => {
		expect(policyFor('/(app)/api/not-a-route')).toBeUndefined();
		expect(policyFor(null)).toBeUndefined();
	});
});

describe('ROUTE_POLICY — redirect loop safety', () => {
	it('leaves every redirect target open so the gate cannot deadlock', () => {
		for (const routeId of REDIRECT_TARGET_ROUTES) {
			expect(ROUTE_POLICY[routeId], `${routeId} must stay open`).toBe('open');
		}
	});
});

describe('UPGRADE_SLUG', () => {
	it('covers every feature key, so no gated feature can redirect to an empty slug', () => {
		const declared = Object.keys(UPGRADE_SLUG).sort();
		const actual = Object.keys(TIERS.business.features).sort();

		expect(declared).toEqual(actual);
	});

	it('keeps the slugs the billing page already renders', () => {
		expect(UPGRADE_SLUG.weeklyDigest).toBe('digest');
		expect(UPGRADE_SLUG.supplierScores).toBe('prices');
	});
});
