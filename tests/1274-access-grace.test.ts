/**
 * RULE-267 (issue #1274): past_due keeps access for a 7-day grace window, and
 * the access gate and the effective tier agree in every status.
 */
import { describe, it, expect } from 'vitest';
import {
	isAccessAllowed,
	resolveAccessState,
	effectiveTier,
	PAST_DUE_GRACE_DAYS,
	type SubscriptionStatus,
} from '../src/lib/server/billing';
import { DAY_MS } from '../src/lib/constants';

const STATUSES: SubscriptionStatus[] = ['trialing', 'active', 'past_due', 'paused', 'canceled', 'incomplete'];
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);
const ahead = (days: number) => new Date(Date.now() + days * DAY_MS);

describe('past_due grace period', () => {
	it('is 7 days', () => {
		expect(PAST_DUE_GRACE_DAYS).toBe(7);
	});

	it('keeps access inside the window and drops it after', () => {
		expect(isAccessAllowed('past_due', null, ago(1))).toBe(true);
		expect(isAccessAllowed('past_due', null, ago(6.9))).toBe(true);
		expect(isAccessAllowed('past_due', null, ago(7.1))).toBe(false);
	});

	it('denies a past_due row with no recorded start', () => {
		expect(isAccessAllowed('past_due', null, null)).toBe(false);
		expect(isAccessAllowed('past_due', null)).toBe(false);
	});
});

describe('access gate and effective tier agree', () => {
	const cases = STATUSES.flatMap((status) => [
		{ status, trialEndsAt: ahead(3), pastDueSince: ago(1), label: 'fresh' },
		{ status, trialEndsAt: ago(3), pastDueSince: ago(8), label: 'expired' },
		{ status, trialEndsAt: null, pastDueSince: null, label: 'no dates' },
	]);

	it.each(cases)('$status ($label): paid tier iff access allowed', ({ status, trialEndsAt, pastDueSince }) => {
		const sub = { planTier: 'pro', status, trialEndsAt, pastDueSince };
		const { allowed } = resolveAccessState(sub);
		expect(effectiveTier(sub)).toBe(allowed ? 'pro' : 'trial');
	});

	it('past_due inside grace keeps the paid tier, outside drops to trial', () => {
		const base = { planTier: 'business', status: 'past_due', trialEndsAt: null };
		expect(effectiveTier({ ...base, pastDueSince: ago(2) })).toBe('business');
		expect(effectiveTier({ ...base, pastDueSince: ago(9) })).toBe('trial');
	});
});
