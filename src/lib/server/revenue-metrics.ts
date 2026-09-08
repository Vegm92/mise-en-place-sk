import { count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
	acquisitionCosts,
	invoices,
	mrrSnapshots,
	restaurants,
	revenueAssumptions,
	subscriptions,
	waitlist,
} from './schema';
import { TIERS, planMonthlyPriceCents, type PlanTier } from './billing';
import {
	DEFAULT_GROSS_MARGIN_PCT,
	DEFAULT_LTV_HORIZON_MONTHS,
	acvCents,
	addMonths,
	arpaCents,
	buildCohorts,
	cacCents,
	grossRetention,
	logoChurnRate,
	ltvCacRatio,
	ltvCents,
	monthKey,
	monthRange,
	monthsBetween,
	mrrMovement,
	netRetention,
	paybackMonths,
	revenueChurnRate,
	type CohortRow,
	type MrrMovement,
	type TenantMrr,
} from '$lib/revenue-math';

export const MRR_SNAPSHOT_QUEUE = 'scheduled-mrr-snapshot';
export const MRR_SNAPSHOT_CRON = '15 2 * * *';

export const COST_CATEGORIES = ['marketing', 'salaries', 'tools', 'other'] as const;
export type CostCategory = typeof COST_CATEGORIES[number];

export const DEFAULT_CAC_WINDOW_MONTHS = 3;
const HISTORY_MONTHS = 13;
const CHURN_WINDOW_MONTHS = 6;
const NRR_LOOKBACK_MONTHS = 12;
const ACTIVE_STATUSES = ['active'] as const;
const AT_RISK_STATUSES = ['past_due'] as const;

export interface AssumptionValues {
	grossMarginPct: number;
	ltvHorizonMonths: number;
	cacWindowMonths: number;
}

const ASSUMPTION_DEFAULTS: AssumptionValues = {
	grossMarginPct: DEFAULT_GROSS_MARGIN_PCT,
	ltvHorizonMonths: DEFAULT_LTV_HORIZON_MONTHS,
	cacWindowMonths: DEFAULT_CAC_WINDOW_MONTHS,
};

const ASSUMPTION_BOUNDS: Record<keyof AssumptionValues, { min: number; max: number }> = {
	grossMarginPct:   { min: 0, max: 100 },
	ltvHorizonMonths: { min: 1, max: 120 },
	cacWindowMonths:  { min: 1, max: 24 },
};

export function isAssumptionKey(key: string): key is keyof AssumptionValues {
	return key in ASSUMPTION_DEFAULTS;
}

export function clampAssumption(key: keyof AssumptionValues, value: number): number {
	const { min, max } = ASSUMPTION_BOUNDS[key];
	return Math.min(Math.max(value, min), max);
}

export async function getAssumptions(): Promise<AssumptionValues> {
	const rows = await db.select().from(revenueAssumptions);
	const values = { ...ASSUMPTION_DEFAULTS };
	for (const row of rows) {
		if (!isAssumptionKey(row.key)) continue;
		const parsed = Number(row.value);
		if (Number.isFinite(parsed)) values[row.key] = clampAssumption(row.key, parsed);
	}
	return values;
}

export async function saveAssumptions(
	input: Partial<Record<keyof AssumptionValues, number>>,
	updatedBy: string | null,
): Promise<void> {
	const entries = Object.entries(input).filter(
		(entry): entry is [keyof AssumptionValues, number] =>
			isAssumptionKey(entry[0]) && typeof entry[1] === 'number' && Number.isFinite(entry[1]),
	);
	if (entries.length === 0) return;
	await Promise.all(entries.map(([key, value]) =>
		db.insert(revenueAssumptions)
			.values({ key, value: String(clampAssumption(key, value)), updatedBy })
			.onConflictDoUpdate({
				target: revenueAssumptions.key,
				set: { value: String(clampAssumption(key, value)), updatedBy, updatedAt: new Date() },
			}),
	));
}

interface LiveSubscription {
	restaurantId: string;
	planTier: PlanTier;
	status: string;
	trialEndsAt: Date | null;
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	stripePriceId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
}

async function liveSubscriptions(): Promise<LiveSubscription[]> {
	const rows = await db.select({
		restaurantId:         subscriptions.restaurantId,
		planTier:             subscriptions.planTier,
		status:               subscriptions.status,
		trialEndsAt:          subscriptions.trialEndsAt,
		currentPeriodEnd:     subscriptions.currentPeriodEnd,
		cancelAtPeriodEnd:    subscriptions.cancelAtPeriodEnd,
		stripeCustomerId:     subscriptions.stripeCustomerId,
		stripeSubscriptionId: subscriptions.stripeSubscriptionId,
		stripePriceId:        subscriptions.stripePriceId,
		createdAt:            subscriptions.createdAt,
		updatedAt:            subscriptions.updatedAt,
	}).from(subscriptions);

	return rows.map(row => ({ ...row, planTier: (row.planTier ?? 'trial') as PlanTier }));
}

function historySource(isCurrentMonth: boolean, monthRows: Array<{ source: string | null }>): string {
	if (isCurrentMonth) return 'live';
	if (monthRows.some(r => r.source === 'live')) return 'live';
	return monthRows.length > 0 ? 'estimated' : 'none';
}

function mrrOf(sub: { planTier: PlanTier; status: string }): number {
	return (ACTIVE_STATUSES as readonly string[]).includes(sub.status) ? planMonthlyPriceCents(sub.planTier) : 0;
}

function atRiskOf(sub: { planTier: PlanTier; status: string }): number {
	return (AT_RISK_STATUSES as readonly string[]).includes(sub.status) ? planMonthlyPriceCents(sub.planTier) : 0;
}

export function currentMonth(now: Date = new Date()): string {
	return monthKey(now);
}

export async function captureMrrSnapshot(
	month: string = currentMonth(),
): Promise<{ month: string; tenants: number; mrrCents: number }> {
	const subs = await liveSubscriptions();
	if (subs.length === 0) return { month, tenants: 0, mrrCents: 0 };

	const rows = subs.map(sub => ({
		month,
		restaurantId: sub.restaurantId,
		planTier:     sub.planTier,
		status:       sub.status,
		mrrCents:     mrrOf(sub),
		atRiskCents:  atRiskOf(sub),
		source:       'live',
		capturedAt:   new Date(),
	}));

	await db.insert(mrrSnapshots)
		.values(rows)
		.onConflictDoUpdate({
			target: [mrrSnapshots.month, mrrSnapshots.restaurantId],
			set: {
				planTier:    sql`excluded.plan_tier`,
				status:      sql`excluded.status`,
				mrrCents:    sql`excluded.mrr_cents`,
				atRiskCents: sql`excluded.at_risk_cents`,
				source:      sql`excluded.source`,
				capturedAt:  sql`excluded.captured_at`,
			},
		});

	return {
		month,
		tenants: rows.length,
		mrrCents: rows.reduce((sum, r) => sum + r.mrrCents, 0),
	};
}

export async function runMrrSnapshotJob(): Promise<{ month: string; tenants: number; mrrCents: number }> {
	return await captureMrrSnapshot();
}

function backfillRowsFor(
	sub: LiveSubscription,
	today: string,
): Array<typeof mrrSnapshots.$inferInsert> {
	const price = planMonthlyPriceCents(sub.planTier);
	if (price === 0) return [];

	const startedAt = sub.trialEndsAt ?? sub.createdAt;
	if (!startedAt) return [];
	const from = monthKey(startedAt);

	const endedAt = sub.status === 'canceled' ? sub.updatedAt : null;
	const to = endedAt ? monthKey(endedAt) : today;
	if (monthsBetween(from, to) < 0) return [];

	const rows: Array<typeof mrrSnapshots.$inferInsert> = [];
	for (const month of monthRange(from, to)) {
		if (month === today) continue;
		rows.push({
			month,
			restaurantId: sub.restaurantId,
			planTier:     sub.planTier,
			status:       'active',
			mrrCents:     price,
			atRiskCents:  0,
			source:       'estimated',
		});
	}
	return rows;
}

export async function backfillMrrSnapshots(
	now: Date = new Date(),
): Promise<{ months: number; rows: number }> {
	const subs = await liveSubscriptions();
	const today = currentMonth(now);
	const rows: Array<typeof mrrSnapshots.$inferInsert> = [];

	for (const sub of subs) rows.push(...backfillRowsFor(sub, today));

	if (rows.length === 0) return { months: 0, rows: 0 };

	await db.insert(mrrSnapshots).values(rows).onConflictDoNothing({
		target: [mrrSnapshots.month, mrrSnapshots.restaurantId],
	});

	return { months: new Set(rows.map(r => r.month)).size, rows: rows.length };
}

export interface SpendRow {
	id: number;
	month: string;
	category: string;
	amountCents: number;
	note: string | null;
	createdAt: string | null;
}

export async function addAcquisitionCost(input: {
	month: string;
	category: CostCategory;
	amountCents: number;
	note: string | null;
	createdBy: string | null;
}): Promise<void> {
	await db.insert(acquisitionCosts).values(input);
}

export async function deleteAcquisitionCost(id: number): Promise<void> {
	await db.delete(acquisitionCosts).where(eq(acquisitionCosts.id, id));
}

export interface LeakItem {
	key: string;
	count: number;
	monthlyImpactCents: number;
	severity: 'info' | 'warn' | 'error';
}

export interface FunnelStage {
	key: string;
	count: number;
	dropFromPrevious: number | null;
}

export interface RevenueOverview {
	month: string;
	generatedAt: string;
	mrrCents: number;
	arrCents: number;
	payingCustomers: number;
	atRiskMrrCents: number;
	atRiskCustomers: number;
	arpaCents: number;
	acvCents: number;
	trialCustomers: number;
	totalTenants: number;
	byTier: Array<{ tier: PlanTier; customers: number; mrrCents: number }>;
	history: Array<{ month: string; mrrCents: number; payingCustomers: number; source: string }>;
	movement: MrrMovement | null;
	movementMonth: string | null;
	nrrAnnual: number | null;
	nrrMonthly: number | null;
	grrMonthly: number | null;
	logoChurn: number | null;
	revenueChurn: number | null;
	avgMonthlyChurn: number | null;
	lifetimeMonths: number;
	cacCents: number | null;
	cacSpendCents: number;
	cacNewCustomers: number;
	cacWindowFrom: string;
	cacWindowTo: string;
	ltvCents: number;
	ltvCacRatio: number | null;
	paybackMonths: number | null;
	cohorts: CohortRow[];
	funnel: FunnelStage[];
	leaks: LeakItem[];
	spendByMonth: Array<{ month: string; totalCents: number }>;
	costs: SpendRow[];
	assumptions: AssumptionValues;
	snapshotMonths: number;
	estimatedMonths: number;
	lastCapturedAt: string | null;
	priceByTier: Array<{ tier: PlanTier; monthlyCents: number }>;
}

interface SnapshotRow {
	month: string;
	restaurantId: string;
	mrrCents: number;
	atRiskCents: number;
	status: string;
	source: string;
}

async function snapshotHistory(months: string[]): Promise<SnapshotRow[]> {
	if (months.length === 0) return [];
	// tenant-scope-ok: platform revenue analytics — MRR history is aggregated
	// across every tenant by design and is only ever read by the admin console.
	const rows = await db.select({
		month:        mrrSnapshots.month,
		restaurantId: mrrSnapshots.restaurantId,
		mrrCents:     mrrSnapshots.mrrCents,
		atRiskCents:  mrrSnapshots.atRiskCents,
		status:       mrrSnapshots.status,
		source:       mrrSnapshots.source,
	})
		.from(mrrSnapshots)
		.where(inArray(mrrSnapshots.month, months));
	return rows;
}

async function payingHistory(): Promise<Array<{ month: string; restaurantId: string; mrrCents: number }>> {
	// tenant-scope-ok: platform revenue analytics — cohort retention is computed
	// over all paying tenants and never surfaced inside a tenant session.
	const rows = await db.select({
		month:        mrrSnapshots.month,
		restaurantId: mrrSnapshots.restaurantId,
		mrrCents:     mrrSnapshots.mrrCents,
	})
		.from(mrrSnapshots)
		.where(gt(mrrSnapshots.mrrCents, 0));
	return rows;
}

function tenantMrr(rows: SnapshotRow[], month: string): TenantMrr[] {
	return rows.filter(r => r.month === month).map(r => ({ restaurantId: r.restaurantId, mrrCents: r.mrrCents }));
}

function payers(rows: TenantMrr[]): number {
	return rows.filter(r => r.mrrCents > 0).length;
}

function averageMonthlyChurn(history: Map<string, TenantMrr[]>, months: string[]): number | null {
	const rates: number[] = [];
	for (let i = 1; i < months.length; i++) {
		const previous = history.get(months[i - 1]!) ?? [];
		const current = history.get(months[i]!) ?? [];
		const startCustomers = payers(previous);
		if (startCustomers === 0) continue;
		const currentMap = new Map(current.map(r => [r.restaurantId, r.mrrCents]));
		const churned = previous.filter(r => r.mrrCents > 0 && (currentMap.get(r.restaurantId) ?? 0) === 0).length;
		rates.push(churned / startCustomers);
	}
	if (rates.length === 0) return null;
	return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

async function acquisitionFunnel(subs: LiveSubscription[]): Promise<{ funnel: FunnelStage[]; neverActivated: number }> {
	const [waitlistRow] = await db.select({ n: count() }).from(waitlist);
	const [tenantRow] = await db.select({ n: count() }).from(restaurants);

	// tenant-scope-ok: platform activation funnel — counts distinct tenants that
	// ever saved an invoice, an intentionally cross-tenant aggregate.
	const [activatedRow] = await db
		.select({ n: sql<number>`COUNT(DISTINCT ${invoices.restaurantId})::int` })
		.from(invoices);

	const signups = Number(tenantRow?.n ?? 0);
	const activated = Number(activatedRow?.n ?? 0);
	const paying = subs.filter(s => mrrOf(s) > 0).length;

	const stages: Array<{ key: string; count: number }> = [
		{ key: 'waitlist', count: Number(waitlistRow?.n ?? 0) },
		{ key: 'signup', count: signups },
		{ key: 'activated', count: activated },
		{ key: 'paying', count: paying },
	];

	const funnel = stages.map((stage, i) => ({
		...stage,
		dropFromPrevious: i === 0 ? null : Math.max((stages[i - 1]?.count ?? 0) - stage.count, 0),
	}));

	return { funnel, neverActivated: Math.max(signups - activated, 0) };
}

function syncLeaks(subs: LiveSubscription[], now: Date): LeakItem[] {
	const configuredPriceIds = new Set(
		Object.values(TIERS).map(config => config.stripePriceId).filter(Boolean),
	);

	const unknownPrice = subs.filter(s => s.stripePriceId && !configuredPriceIds.has(s.stripePriceId));
	const activeWithoutStripe = subs.filter(s => mrrOf(s) > 0 && !s.stripeSubscriptionId);
	const stalePeriod = subs.filter(s =>
		mrrOf(s) > 0 && s.currentPeriodEnd !== null && s.currentPeriodEnd.getTime() < now.getTime());
	const expiredTrials = subs.filter(s =>
		s.status === 'trialing' && s.trialEndsAt !== null && s.trialEndsAt.getTime() < now.getTime());
	const abandonedCheckout = subs.filter(s => s.stripeCustomerId && !s.stripeSubscriptionId && s.status === 'trialing');
	const pastDue = subs.filter(s => atRiskOf(s) > 0);
	const scheduledCancel = subs.filter(s => s.cancelAtPeriodEnd && mrrOf(s) > 0);

	const impact = (rows: LiveSubscription[], fallbackPrice = true) =>
		rows.reduce((sum, s) => sum + (fallbackPrice ? planMonthlyPriceCents(s.planTier) : 0), 0);

	return [
		{ key: 'pastDue', count: pastDue.length, monthlyImpactCents: impact(pastDue), severity: 'error' },
		{ key: 'scheduledCancel', count: scheduledCancel.length, monthlyImpactCents: impact(scheduledCancel), severity: 'warn' },
		{ key: 'expiredTrial', count: expiredTrials.length, monthlyImpactCents: 0, severity: 'warn' },
		{ key: 'abandonedCheckout', count: abandonedCheckout.length, monthlyImpactCents: 0, severity: 'info' },
		{ key: 'stalePeriod', count: stalePeriod.length, monthlyImpactCents: impact(stalePeriod), severity: 'warn' },
		{ key: 'activeWithoutStripe', count: activeWithoutStripe.length, monthlyImpactCents: impact(activeWithoutStripe), severity: 'error' },
		{ key: 'unknownPrice', count: unknownPrice.length, monthlyImpactCents: 0, severity: 'error' },
	];
}

export async function revenueOverview(now: Date = new Date()): Promise<RevenueOverview> {
	const month = currentMonth(now);
	const assumptions = await getAssumptions();

	const historyMonths = monthRange(addMonths(month, -(HISTORY_MONTHS - 1)), month);
	const nrrBaselineMonth = addMonths(month, -NRR_LOOKBACK_MONTHS);
	const wantedMonths = [...new Set([...historyMonths, nrrBaselineMonth])];

	const subs = await liveSubscriptions();
	const [snapshots, paying, costRows, funnelData, lastCapturedRows] = await Promise.all([
		snapshotHistory(wantedMonths),
		payingHistory(),
		db.select().from(acquisitionCosts).orderBy(desc(acquisitionCosts.month), desc(acquisitionCosts.id)).limit(200),
		acquisitionFunnel(subs),
		// tenant-scope-ok: freshness probe over the platform-wide snapshot table.
		db.select({ at: mrrSnapshots.capturedAt })
			.from(mrrSnapshots)
			.where(eq(mrrSnapshots.source, 'live'))
			.orderBy(desc(mrrSnapshots.capturedAt))
			.limit(1),
	]);

	const payingSubs = subs.filter(s => mrrOf(s) > 0);
	const mrrCents = payingSubs.reduce((sum, s) => sum + mrrOf(s), 0);
	const atRiskSubs = subs.filter(s => atRiskOf(s) > 0);
	const arpa = arpaCents(mrrCents, payingSubs.length);

	const byTier = (Object.keys(TIERS) as PlanTier[]).map(tier => ({
		tier,
		customers: payingSubs.filter(s => s.planTier === tier).length,
		mrrCents: payingSubs.filter(s => s.planTier === tier).reduce((sum, s) => sum + mrrOf(s), 0),
	})).filter(row => row.customers > 0 || row.tier !== 'trial');

	const perMonth = new Map<string, TenantMrr[]>();
	for (const snapshotMonth of wantedMonths) perMonth.set(snapshotMonth, tenantMrr(snapshots, snapshotMonth));
	perMonth.set(month, subs.map(s => ({ restaurantId: s.restaurantId, mrrCents: mrrOf(s) })));

	const history = historyMonths.map(m => {
		const rows = perMonth.get(m) ?? [];
		const monthRows = snapshots.filter(r => r.month === m);
		return {
			month: m,
			mrrCents: rows.reduce((sum, r) => sum + r.mrrCents, 0),
			payingCustomers: payers(rows),
			source: historySource(m === month, monthRows),
		};
	});

	const previousMonth = addMonths(month, -1);
	const hasPrevious = (perMonth.get(previousMonth) ?? []).length > 0;
	const everPaidBefore = new Set(
		paying.filter(r => monthsBetween(r.month, previousMonth) > 0).map(r => r.restaurantId),
	);

	const movement = hasPrevious
		? mrrMovement(perMonth.get(previousMonth) ?? [], perMonth.get(month) ?? [], everPaidBefore)
		: null;

	const nrrMonthly = hasPrevious ? netRetention(perMonth.get(previousMonth) ?? [], perMonth.get(month) ?? []) : null;
	const grrMonthly = hasPrevious ? grossRetention(perMonth.get(previousMonth) ?? [], perMonth.get(month) ?? []) : null;
	const baselineRows = perMonth.get(nrrBaselineMonth) ?? [];
	const nrrAnnual = baselineRows.length > 0 ? netRetention(baselineRows, perMonth.get(month) ?? []) : null;

	const churnMonths = historyMonths.slice(-(CHURN_WINDOW_MONTHS + 1));
	const avgMonthlyChurn = averageMonthlyChurn(perMonth, churnMonths);
	const currentByTenant = new Map((perMonth.get(month) ?? []).map(r => [r.restaurantId, r.mrrCents]));
	const churnedCustomers = (perMonth.get(previousMonth) ?? [])
		.filter(r => r.mrrCents > 0 && (currentByTenant.get(r.restaurantId) ?? 0) === 0).length;
	const logoChurn = hasPrevious
		? logoChurnRate(payers(perMonth.get(previousMonth) ?? []), churnedCustomers)
		: null;
	const revenueChurn = movement ? revenueChurnRate(movement.startCents, movement.churnedCents) : null;

	const cohortOf = new Map<string, string>();
	for (const row of paying) {
		const known = cohortOf.get(row.restaurantId);
		if (!known || row.month < known) cohortOf.set(row.restaurantId, row.month);
	}
	const payingMonths = new Map<string, Map<string, number>>();
	for (const row of paying) {
		const months = payingMonths.get(row.restaurantId) ?? new Map<string, number>();
		months.set(row.month, row.mrrCents);
		payingMonths.set(row.restaurantId, months);
	}
	const latestSnapshotMonth = paying.reduce((latest, row) => (row.month > latest ? row.month : latest), '0000-00');
	const cohorts = buildCohorts(cohortOf, payingMonths, latestSnapshotMonth).slice(0, 18);

	const cacWindowTo = addMonths(month, -1);
	const cacWindowFrom = addMonths(cacWindowTo, -(assumptions.cacWindowMonths - 1));
	const windowMonths = new Set(monthRange(cacWindowFrom, cacWindowTo));
	const cacSpendCents = costRows
		.filter(row => windowMonths.has(row.month))
		.reduce((sum, row) => sum + row.amountCents, 0);
	const cacNewCustomers = [...cohortOf.values()].filter(m => windowMonths.has(m)).length;
	const cac = cacCents(cacSpendCents, cacNewCustomers);

	const ltv = ltvCents(arpa, assumptions.grossMarginPct, avgMonthlyChurn, assumptions.ltvHorizonMonths);
	const lifetimeMonths = arpa > 0 ? ltv / (arpa * (assumptions.grossMarginPct / 100)) : assumptions.ltvHorizonMonths;

	const spendByMonth = [...costRows.reduce((map, row) => {
		map.set(row.month, (map.get(row.month) ?? 0) + row.amountCents);
		return map;
	}, new Map<string, number>())]
		.map(([m, totalCents]) => ({ month: m, totalCents }))
		.sort((a, b) => (a.month < b.month ? 1 : -1))
		.slice(0, 12);

	const leaks = [
		...syncLeaks(subs, now),
		{ key: 'neverActivated', count: funnelData.neverActivated, monthlyImpactCents: 0, severity: 'warn' as const },
	];

	return {
		month,
		generatedAt: now.toISOString(),
		mrrCents,
		arrCents: mrrCents * 12,
		payingCustomers: payingSubs.length,
		atRiskMrrCents: atRiskSubs.reduce((sum, s) => sum + atRiskOf(s), 0),
		atRiskCustomers: atRiskSubs.length,
		arpaCents: arpa,
		acvCents: acvCents(arpa),
		trialCustomers: subs.filter(s => s.status === 'trialing').length,
		totalTenants: funnelData.funnel.find(stage => stage.key === 'signup')?.count ?? subs.length,
		byTier,
		history,
		movement,
		movementMonth: hasPrevious ? previousMonth : null,
		nrrAnnual,
		nrrMonthly,
		grrMonthly,
		logoChurn,
		revenueChurn,
		avgMonthlyChurn,
		lifetimeMonths,
		cacCents: cac,
		cacSpendCents,
		cacNewCustomers,
		cacWindowFrom,
		cacWindowTo,
		ltvCents: ltv,
		ltvCacRatio: ltvCacRatio(ltv, cac),
		paybackMonths: paybackMonths(cac, arpa, assumptions.grossMarginPct),
		cohorts,
		funnel: funnelData.funnel,
		leaks,
		spendByMonth,
		costs: costRows.map(row => ({
			id: row.id,
			month: row.month,
			category: row.category,
			amountCents: row.amountCents,
			note: row.note,
			createdAt: row.createdAt?.toISOString() ?? null,
		})),
		assumptions,
		snapshotMonths: new Set(snapshots.map(r => r.month)).size,
		estimatedMonths: new Set(snapshots.filter(r => r.source === 'estimated').map(r => r.month)).size,
		lastCapturedAt: lastCapturedRows[0]?.at?.toISOString() ?? null,
		priceByTier: (Object.keys(TIERS) as PlanTier[])
			.filter(tier => tier !== 'trial')
			.map(tier => ({ tier, monthlyCents: planMonthlyPriceCents(tier) })),
	};
}
