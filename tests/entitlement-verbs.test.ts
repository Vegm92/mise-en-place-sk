/**
 * Entitlement enforcement across endpoint × verb × tier (issue #520).
 *
 * `tests/entitlement-routes.test.ts` proves every route is *classified* and
 * that the gate is registered. `tests/require-feature.test.ts` proves the
 * in-handler `requireFeature` guard matches the TIERS matrix. Neither shows
 * that a gated endpoint refuses a POST as firmly as it refuses a GET — and a
 * read-only gate on a write endpoint is exactly the shape a paywall bug takes.
 *
 * The gate is `entitlementHandle`, which keys off `event.route.id` and runs
 * before any handler, so verb-independence is a property of the design. That
 * property is worth pinning down: this drives the real handle over every
 * (gated route × verb it actually exports × tier) and asserts the handler is
 * never reached for a tier that lacks the feature, whatever the verb.
 *
 * The verbs are read off the route files rather than listed here, so adding a
 * POST to a gated GET-only endpoint extends the table automatically.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isRedirect } from '@sveltejs/kit';

vi.mock('../src/lib/server/db', () => {
	const chain = () => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'limit']) p[m] = () => p;
		p.then = (res: (v: unknown) => unknown) => Promise.resolve([]).then(res);
		return p;
	};
	return { db: { select: chain }, forTenant: () => ({ scope: () => ({}) }) };
});

import { ROUTE_POLICY, UPGRADE_SLUG, entitlementHandle, type RoutePolicy } from '../src/lib/server/entitlements';
import { TIERS, type PlanTier } from '../src/lib/server/billing';

const TIER_NAMES = Object.keys(TIERS) as PlanTier[];
const ROUTES_DIR = path.join(process.cwd(), 'src', 'routes');

/** Route ids carry their layout groups; URLs do not. */
function pathnameFor(routeId: string): string {
	const stripped = routeId.replace(/\/\([^)]*\)/g, '');
	return stripped === '' ? '/' : stripped;
}

/**
 * The verbs a route actually answers. A `+server.ts` declares them directly;
 * a `+page.server.ts` answers GET through `load` and POST through `actions`.
 */
function verbsFor(routeId: string): string[] {
	const dir = path.join(ROUTES_DIR, routeId.replace(/^\//, ''));
	const server = path.join(dir, '+server.ts');
	const pageServer = path.join(dir, '+page.server.ts');

	if (fs.existsSync(server)) {
		const src = fs.readFileSync(server, 'utf8');
		return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((v) =>
			new RegExp(`export const ${v}\\b`).test(src)
		);
	}

	if (fs.existsSync(pageServer)) {
		const src = fs.readFileSync(pageServer, 'utf8');
		const verbs: string[] = [];
		if (/export const load\b|export function load\b/.test(src)) verbs.push('GET');
		if (/export const actions\b/.test(src)) verbs.push('POST');
		return verbs;
	}

	return [];
}

const gatedRoutes = Object.entries(ROUTE_POLICY)
	.filter(([, policy]) => policy !== 'open')
	.map(([routeId, policy]) => ({
		routeId,
		policy: policy as Exclude<RoutePolicy, 'open'>,
		pathname: pathnameFor(routeId),
		verbs: verbsFor(routeId),
	}));

/** One row per endpoint × verb × tier — the table the issue asked for. */
const table = gatedRoutes.flatMap(({ routeId, policy, pathname, verbs }) =>
	verbs.flatMap((verb) =>
		TIER_NAMES.map((tier) => ({
			routeId,
			policy,
			pathname,
			verb,
			tier,
			isApi: pathname.startsWith('/api/'),
			allowed: !policy.feature || TIERS[tier].features[policy.feature],
		}))
	)
);

/**
 * Runs the real gate. `resolve` records whether the handler was reached and
 * returns a sentinel body, so "allowed" means the request got through rather
 * than merely not throwing.
 */
async function runGate(input: { routeId: string; pathname: string; verb: string; tier: PlanTier }) {
	const reached = { value: false };
	const event = {
		route: { id: input.routeId },
		url: new URL(`https://app.test${input.pathname}`),
		request: { method: input.verb },
		locals: {
			entitlements: async () => ({
				features: TIERS[input.tier].features,
				access: { allowed: true, trialExpired: false },
			}),
		},
	};

	const resolve = async () => {
		reached.value = true;
		return new Response('handler', { status: 200 });
	};

	const outcome = await Promise.resolve(entitlementHandle({ event, resolve } as never)).catch(
		(e: unknown) => e
	);

	return { reached: reached.value, outcome };
}

describe('the endpoint × verb × tier table is populated', () => {
	it('covers at least one gated route', () => {
		expect(gatedRoutes.length).toBeGreaterThan(0);
	});

	it.each(gatedRoutes.map((r) => r.routeId))('%s exposes at least one verb', (routeId) => {
		const route = gatedRoutes.find((r) => r.routeId === routeId)!;
		expect(route.verbs, `no +server.ts or +page.server.ts verbs found for ${routeId}`).not.toHaveLength(0);
	});

	it('includes a mutating verb, so the table is not vacuously GET-only', () => {
		expect(table.some((row) => row.verb !== 'GET')).toBe(true);
	});
});

describe.each(table)(
	'$verb $pathname as $tier',
	({ routeId, policy, pathname, verb, tier, isApi, allowed }) => {
		it(allowed ? 'reaches the handler' : 'never reaches the handler', async () => {
			const { reached } = await runGate({ routeId, pathname, verb, tier });
			expect(reached).toBe(allowed);
		});

		if (!allowed) {
			it(isApi ? 'answers 402 without a redirect' : 'redirects to the upgrade page', async () => {
				const { outcome } = await runGate({ routeId, pathname, verb, tier });

				if (isApi) {
					expect(outcome).toBeInstanceOf(Response);
					const res = outcome as Response;
					expect(res.status).toBe(402);
					await expect(res.json()).resolves.toMatchObject({
						error: 'plan_upgrade_required',
						feature: policy.feature,
					});
				} else {
					expect(outcome).toSatisfy(isRedirect);
					const redirectOutcome = outcome as { status: number; location: string };
					expect(redirectOutcome.status).toBe(303);
					expect(redirectOutcome.location).toBe(`/billing?upgrade=${UPGRADE_SLUG[policy.feature!]}`);
				}
			});
		}
	}
);

describe('a gated endpoint refuses every verb identically', () => {
	const multiVerb = gatedRoutes.filter((r) => r.verbs.length > 1);

	it('has an endpoint exposing more than one verb', () => {
		expect(multiVerb.length).toBeGreaterThan(0);
	});

	it.each(
		multiVerb.flatMap(({ routeId, pathname, verbs }) =>
			TIER_NAMES.map((tier) => ({ routeId, pathname, verbs, tier }))
		)
	)('$routeId treats $verbs alike as $tier', async ({ routeId, pathname, verbs, tier }) => {
		const outcomes = await Promise.all(
			verbs.map(async (verb) => {
				const { reached, outcome } = await runGate({ routeId, pathname, verb, tier });
				const status = outcome instanceof Response ? outcome.status
					: isRedirect(outcome) ? (outcome as { status: number }).status
					: 0;
				return `${reached}:${status}`;
			})
		);

		expect(new Set(outcomes).size, `verbs diverged: ${verbs.join('/')} → ${outcomes.join(', ')}`).toBe(1);
	});
});

describe('an expired trial is refused on every verb of an access-gated route', () => {
	const accessRoutes = gatedRoutes.filter((r) => r.policy.access);

	it('has an access-gated route to check', () => {
		expect(accessRoutes.length).toBeGreaterThan(0);
	});

	it.each(accessRoutes.flatMap(({ routeId, pathname, verbs, policy }) =>
		verbs.map((verb) => ({ routeId, pathname, verb, policy }))
	))('$verb $pathname is refused', async ({ routeId, pathname, verb }) => {
		const reached = { value: false };
		const event = {
			route: { id: routeId },
			url: new URL(`https://app.test${pathname}`),
			request: { method: verb },
			locals: {
				entitlements: async () => ({
					features: TIERS.business.features,
					access: { allowed: false, trialExpired: true },
				}),
			},
		};
		const resolve = async () => {
			reached.value = true;
			return new Response('handler');
		};

		const outcome = await Promise.resolve(entitlementHandle({ event, resolve } as never)).catch(
			(e: unknown) => e
		);

		expect(reached.value).toBe(false);
		if (pathname.startsWith('/api/')) {
			expect((outcome as Response).status).toBe(402);
			await expect((outcome as Response).json()).resolves.toMatchObject({ error: 'trial_expired' });
		} else {
			expect(outcome).toSatisfy(isRedirect);
			expect((outcome as { location: string }).location).toBe('/billing?upgrade=trial');
		}
	});
});
