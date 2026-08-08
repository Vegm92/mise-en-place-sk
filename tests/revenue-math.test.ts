/**
 * SaaS revenue framework — the pure arithmetic behind the admin revenue page.
 *
 * Everything here is deliberately db-free: `src/lib/revenue-math.ts` holds the
 * formulas (MRR movement, NRR/GRR, CAC, LTV, payback, cohorts) and the server
 * module only feeds it rows. Getting a sign or a denominator wrong in these
 * would quietly misprice the whole funnel, so each is pinned to a hand-computed
 * expectation rather than to whatever the implementation happens to return.
 */
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_LTV_HORIZON_MONTHS,
	acvCents,
	addMonths,
	arpaCents,
	buildCohorts,
	cacCents,
	churnHealth,
	expectedLifetimeMonths,
	grossRetention,
	logoChurnRate,
	ltvCacRatio,
	ltvCents,
	monthKey,
	monthRange,
	monthsBetween,
	mrrMovement,
	netRetention,
	parseAmountCents,
	paybackHealth,
	paybackMonths,
	ratioHealth,
	retentionHealth,
	revenueChurnRate,
	type TenantMrr,
} from '../src/lib/revenue-math';

const t = (restaurantId: string, mrrCents: number): TenantMrr => ({ restaurantId, mrrCents });

describe('month helpers', () => {
	it('formats a month key in UTC', () => {
		expect(monthKey(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01');
	});

	it('shifts months across year boundaries in both directions', () => {
		expect(addMonths('2026-01', -1)).toBe('2025-12');
		expect(addMonths('2026-12', 1)).toBe('2027-01');
		expect(addMonths('2026-06', -12)).toBe('2025-06');
	});

	it('measures distance between months', () => {
		expect(monthsBetween('2026-01', '2026-04')).toBe(3);
		expect(monthsBetween('2026-04', '2026-01')).toBe(-3);
	});

	it('builds an inclusive month range, empty when reversed', () => {
		expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
		expect(monthRange('2026-02', '2026-01')).toEqual([]);
	});
});

describe('mrrMovement', () => {
	it('splits new, expansion, contraction and churn', () => {
		const previous = [t('a', 2900), t('b', 5900), t('c', 2900)];
		const current = [t('a', 5900), t('b', 2900), t('d', 12900)];

		const movement = mrrMovement(previous, current);

		expect(movement.startCents).toBe(11700);
		expect(movement.endCents).toBe(21700);
		expect(movement.newCents).toBe(12900);
		expect(movement.expansionCents).toBe(3000);
		expect(movement.contractionCents).toBe(3000);
		expect(movement.churnedCents).toBe(2900);
		expect(movement.reactivationCents).toBe(0);
	});

	it('counts a returning tenant as reactivation, not new', () => {
		const movement = mrrMovement([t('a', 2900)], [t('a', 2900), t('b', 5900)], new Set(['b']));
		expect(movement.reactivationCents).toBe(5900);
		expect(movement.newCents).toBe(0);
	});

	it('treats a tenant that drops to zero the same as one that disappears', () => {
		const dropped = mrrMovement([t('a', 2900)], [t('a', 0)]);
		const vanished = mrrMovement([t('a', 2900)], []);
		expect(dropped.churnedCents).toBe(2900);
		expect(vanished.churnedCents).toBe(2900);
	});
});

describe('retention rates', () => {
	const previous = [t('a', 2900), t('b', 5900)];

	it('nets expansion against churn', () => {
		expect(netRetention(previous, [t('a', 12900), t('b', 0)])).toBeCloseTo(12900 / 8800, 6);
	});

	it('caps gross retention at the starting revenue', () => {
		expect(grossRetention(previous, [t('a', 12900), t('b', 5900)])).toBe(1);
	});

	it('ignores revenue from tenants that were not in the base period', () => {
		expect(netRetention(previous, [t('a', 2900), t('b', 5900), t('new', 99900)])).toBe(1);
	});

	it('returns null when the base period had no revenue', () => {
		expect(netRetention([], [t('a', 2900)])).toBeNull();
		expect(grossRetention([t('a', 0)], [t('a', 2900)])).toBeNull();
	});

	it('grades retention against the 100% / 90% thresholds', () => {
		expect(retentionHealth(1.15)).toBe('good');
		expect(retentionHealth(0.95)).toBe('warn');
		expect(retentionHealth(0.6)).toBe('bad');
		expect(retentionHealth(null)).toBe('unknown');
	});
});

describe('churn', () => {
	it('computes logo and revenue churn, null without a base', () => {
		expect(logoChurnRate(20, 1)).toBe(0.05);
		expect(logoChurnRate(0, 0)).toBeNull();
		expect(revenueChurnRate(10000, 2500)).toBe(0.25);
		expect(revenueChurnRate(0, 0)).toBeNull();
	});

	it('grades monthly churn', () => {
		expect(churnHealth(0.01)).toBe('good');
		expect(churnHealth(0.04)).toBe('warn');
		expect(churnHealth(0.2)).toBe('bad');
	});
});

describe('per-customer revenue', () => {
	it('derives ARPA and ACV', () => {
		expect(arpaCents(29000, 10)).toBe(2900);
		expect(acvCents(2900)).toBe(34800);
	});

	it('reports zero ARPA rather than dividing by zero', () => {
		expect(arpaCents(0, 0)).toBe(0);
	});
});

describe('CAC, LTV and payback', () => {
	it('divides acquisition spend by customers won', () => {
		expect(cacCents(600000, 12)).toBe(50000);
		expect(cacCents(600000, 0)).toBeNull();
	});

	it('caps expected lifetime at the horizon when churn is zero or tiny', () => {
		expect(expectedLifetimeMonths(0)).toBe(DEFAULT_LTV_HORIZON_MONTHS);
		expect(expectedLifetimeMonths(null)).toBe(DEFAULT_LTV_HORIZON_MONTHS);
		expect(expectedLifetimeMonths(0.001, 36)).toBe(36);
		expect(expectedLifetimeMonths(0.05)).toBe(20);
	});

	it('computes LTV as margin-adjusted ARPA over the expected lifetime', () => {
		expect(ltvCents(5900, 80, 0.05)).toBeCloseTo(5900 * 0.8 * 20, 6);
	});

	it('grades the LTV/CAC ratio against the 3x rule of thumb', () => {
		expect(ratioHealth(ltvCacRatio(ltvCents(5900, 80, 0.05), 20000))).toBe('good');
		expect(ratioHealth(ltvCacRatio(ltvCents(5900, 80, 0.05), 60000))).toBe('warn');
		expect(ratioHealth(ltvCacRatio(ltvCents(5900, 80, 0.05), 200000))).toBe('bad');
		expect(ltvCacRatio(1000, null)).toBeNull();
		expect(ltvCacRatio(1000, 0)).toBeNull();
	});

	it('expresses payback in months of gross profit', () => {
		expect(paybackMonths(20000, 5900, 80)).toBeCloseTo(20000 / (5900 * 0.8), 6);
		expect(paybackMonths(null, 5900, 80)).toBeNull();
		expect(paybackMonths(20000, 0, 80)).toBeNull();
	});

	it('grades payback against the 12 / 18 month thresholds', () => {
		expect(paybackHealth(6)).toBe('good');
		expect(paybackHealth(15)).toBe('warn');
		expect(paybackHealth(30)).toBe('bad');
		expect(paybackHealth(null)).toBe('unknown');
	});
});

describe('parseAmountCents', () => {
	it('accepts the Spanish format the admin form is typed in', () => {
		expect(parseAmountCents('1.250,50')).toBe(125050);
		expect(parseAmountCents('1250,5')).toBe(125050);
		expect(parseAmountCents(' 3 000 € ')).toBe(300000);
	});

	it('accepts a plain decimal point', () => {
		expect(parseAmountCents('1250.50')).toBe(125050);
		expect(parseAmountCents('29')).toBe(2900);
	});

	it('rejects junk, zero, negatives and absurd amounts', () => {
		expect(parseAmountCents('abc')).toBeNull();
		expect(parseAmountCents('')).toBeNull();
		expect(parseAmountCents('0')).toBeNull();
		expect(parseAmountCents('-10')).toBeNull();
		expect(parseAmountCents('999999999999')).toBeNull();
	});
});

describe('buildCohorts', () => {
	const cohortOf = new Map([
		['a', '2026-01'],
		['b', '2026-01'],
		['c', '2026-02'],
	]);
	const paying = new Map([
		['a', new Map([['2026-01', 2900], ['2026-02', 2900], ['2026-03', 2900], ['2026-04', 5900]])],
		['b', new Map([['2026-01', 2900], ['2026-02', 2900]])],
		['c', new Map([['2026-02', 5900]])],
	]);

	it('groups by first paying month, newest cohort first', () => {
		const rows = buildCohorts(cohortOf, paying, '2026-04', [3]);
		expect(rows.map(r => r.month)).toEqual(['2026-02', '2026-01']);
		expect(rows[1].customers).toBe(2);
		expect(rows[1].startMrrCents).toBe(5800);
	});

	it('reports customer and revenue retention at the offset', () => {
		const [jan] = buildCohorts(cohortOf, paying, '2026-04', [3]).filter(r => r.month === '2026-01');
		expect(jan.retention[0]).toEqual({ offset: 3, rate: 0.5, customers: 1 });
		expect(jan.revenueRetention[0].rate).toBeCloseTo(5900 / 5800, 6);
	});

	it('leaves offsets that have not happened yet unknown', () => {
		const [feb] = buildCohorts(cohortOf, paying, '2026-04', [3]).filter(r => r.month === '2026-02');
		expect(feb.retention[0]).toEqual({ offset: 3, rate: null, customers: null });
		expect(feb.revenueRetention[0].rate).toBeNull();
	});
});
