/**
 * requireFeature — the shared tier-entitlement guard used by every gated
 * handler (stock-levels GET+POST, and any future gated route). Table-driven
 * over every tier × feature combination so a handler that switches to this
 * guard can never drift from the published TIERS matrix again (see #488).
 */
import { describe, it, expect, vi } from 'vitest';

const { subscriptionRow } = vi.hoisted(() => ({ subscriptionRow: { value: null as unknown } }));
vi.mock('../src/lib/server/db', () => {
	const chain = () => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'limit']) p[m] = () => p;
		p.then = (res: (v: unknown) => unknown) =>
			Promise.resolve(subscriptionRow.value ? [subscriptionRow.value] : []).then(res);
		return p;
	};
	return { db: { select: chain }, forTenant: () => ({ scope: () => ({}) }) };
});

import { requireFeature, TIERS, type PlanTier, type TierConfig } from '../src/lib/server/billing';

const TIER_NAMES = Object.keys(TIERS) as PlanTier[];
const FEATURE_NAMES = Object.keys(TIERS.business.features) as (keyof TierConfig['features'])[];

describe('requireFeature', () => {
	for (const tier of TIER_NAMES) {
		for (const feature of FEATURE_NAMES) {
			const allowed = TIERS[tier].features[feature];
			it(`${tier} × ${feature}: ${allowed ? 'allows' : 'rejects with 403'}`, async () => {
				subscriptionRow.value = { planTier: tier };
				if (allowed) {
					await expect(requireFeature(feature, 'rid')).resolves.toBeUndefined();
				} else {
					await expect(requireFeature(feature, 'rid')).rejects.toMatchObject({ status: 403 });
				}
			});
		}
	}
});
