import { and, eq, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from './db';
import { invoices, restaurants, systemNotifications } from './schema';
import { isAdminEmail } from './admin';
import { APP_TIMEZONE } from './period-range';
import { sqlRows } from './sql-rows';

const REVIEWED = ne(invoices.reviewState, 'por_revisar');
const WEEK4_ELIGIBLE_DAYS = 28;
const WEEK1_START_DAY = 0;
const WEEK1_END_DAY = 7;
const WEEK4_START_DAY = 21;
const WEEK4_END_DAY = 28;
const ACTIVATION_WINDOW_DAYS = 7;
const MINUTE_MS = 60 * 1000;
const DAY_MINUTES = 24 * 60;
const RECENT_RESTAURANTS = 50;
const COHORT_WEEKS = 12;
const RESERVED_EMAIL = /@(?:[^@]+\.)?(?:test|example|invalid|localhost|example\.com|example\.org|example\.net)$/i;

const INSIGHT_TYPES = ['price_shock', 'possible_duplicate_purchase', 'line_item_mismatch', 'budget_overage'];
const INSIGHT_TARGET_MINUTES = 10;
export const FUNNEL_STEPS = ['signup', 'upload', 'extracted', 'insight', 'week4'] as const;
export const INSIGHT_BUCKETS = [
	{ key: 'le10m', maxMinutes: INSIGHT_TARGET_MINUTES },
	{ key: 'le1h', maxMinutes: 60 },
	{ key: 'le1d', maxMinutes: DAY_MINUTES },
	{ key: 'le7d', maxMinutes: 7 * DAY_MINUTES },
	{ key: 'gt7d', maxMinutes: Infinity },
] as const;

export interface TimeToValueStats {
	sampleSize: number;
	medianMinutes: number | null;
	p90Minutes: number | null;
}

export interface WeekFourRetention {
	cohortSize: number;
	retainedCount: number;
	retentionRate: number | null;
}

export type FunnelStepKey = (typeof FUNNEL_STEPS)[number];
export type WeekFourStatus = 'active' | 'inactive' | 'pending';

export interface MilestoneInput {
	id: string;
	name: string;
	signupAt: Date;
	cohortWeek: string;
	firstUploadAt: Date | null;
	firstExtractedAt: Date | null;
	firstInsightAt: Date | null;
	activeWeekFour: boolean;
}

export interface RestaurantMilestones {
	id: string;
	name: string;
	signupAt: string;
	cohortWeek: string;
	minutesToUpload: number | null;
	minutesToExtracted: number | null;
	minutesToInsight: number | null;
	activated: boolean;
	weekFour: WeekFourStatus;
}

export interface FunnelStep {
	key: FunnelStepKey;
	count: number;
	base: number;
	rate: number | null;
	share: number;
}

export interface InsightBucket {
	key: string;
	count: number;
	share: number;
}

export interface TimeToInsight {
	sampleSize: number;
	medianMinutes: number | null;
	p75Minutes: number | null;
	uploaders: number;
	targetBase: number;
	withinTarget: number;
	withinTargetRate: number | null;
	buckets: InsightBucket[];
}

export interface RateStat {
	eligible: number;
	count: number;
	rate: number | null;
}

export interface SignupCohort {
	week: string;
	signups: number;
	activated: number;
	weekFour: RateStat;
}

export interface ActivationFunnel {
	steps: FunnelStep[];
	timeToInsight: TimeToInsight;
	activation: RateStat;
	weekFour: RateStat;
	cohorts: SignupCohort[];
	restaurants: RestaurantMilestones[];
	excludedInternal: number;
	targetMinutes: number;
}

export async function timeToValueStats(restaurantIds?: string[]): Promise<TimeToValueStats> {
	const filter = restaurantIds ? and(REVIEWED, inArray(invoices.restaurantId, restaurantIds)) : REVIEWED;
	const firstReview = db
		.select({
			restaurantId:    invoices.restaurantId,
			firstReviewedAt: sql<Date>`min(${invoices.createdAt})`.as('first_reviewed_at'),
		})
		.from(invoices)
		.where(filter)
		.groupBy(invoices.restaurantId)
		.as('first_review');

	// tenant-scope-ok: platform time-to-value rollup — median/p90 minutes from
	// a restaurant's own signup to its own first reviewed albarán, aggregated
	// across every tenant for the admin activation metric (issue #786).
	const [row] = await db
		.select({
			sampleSize:    sql<number>`count(*)::int`,
			medianMinutes: sql<number | null>`percentile_cont(0.5) within group (
				order by extract(epoch from (${firstReview.firstReviewedAt} - ${restaurants.createdAt})) / 60
			)`,
			p90Minutes: sql<number | null>`percentile_cont(0.9) within group (
				order by extract(epoch from (${firstReview.firstReviewedAt} - ${restaurants.createdAt})) / 60
			)`,
		})
		.from(firstReview)
		.innerJoin(restaurants, eq(restaurants.id, firstReview.restaurantId));

	return {
		sampleSize:    row?.sampleSize ?? 0,
		medianMinutes: row?.medianMinutes != null ? Number(row.medianMinutes) : null,
		p90Minutes:    row?.p90Minutes != null ? Number(row.p90Minutes) : null,
	};
}

function reviewedInSignupWindow(
	eligible: ReturnType<typeof eligibleRestaurants>,
	startDay: number,
	endDay: number,
) {
	// tenant-scope-ok: platform week-4 retention cohort — restaurants with a
	// reviewed albarán in a signup-relative day window, aggregated across
	// every tenant for the admin activation metric (issue #786).
	return db
		.selectDistinct({ restaurantId: invoices.restaurantId })
		.from(invoices)
		.innerJoin(eligible, eq(eligible.id, invoices.restaurantId))
		.where(and(
			REVIEWED,
			sql`${invoices.createdAt} >= ${eligible.createdAt} + make_interval(days => ${startDay})`,
			sql`${invoices.createdAt} < ${eligible.createdAt} + make_interval(days => ${endDay})`,
		));
}

function eligibleRestaurants(cutoff: Date, restaurantIds?: string[]) {
	const filter = restaurantIds
		? and(lte(restaurants.createdAt, cutoff), inArray(restaurants.id, restaurantIds))
		: lte(restaurants.createdAt, cutoff);
	return db
		.select({ id: restaurants.id, createdAt: restaurants.createdAt })
		.from(restaurants)
		.where(filter)
		.as('eligible');
}

export async function weekFourRetention(now: Date = new Date(), restaurantIds?: string[]): Promise<WeekFourRetention> {
	const cutoff = new Date(now.getTime() - WEEK4_ELIGIBLE_DAYS * 24 * 60 * 60 * 1000);
	const eligible = eligibleRestaurants(cutoff, restaurantIds);

	const [week1Rows, week4Rows] = await Promise.all([
		reviewedInSignupWindow(eligible, WEEK1_START_DAY, WEEK1_END_DAY),
		reviewedInSignupWindow(eligible, WEEK4_START_DAY, WEEK4_END_DAY),
	]);

	const week1 = new Set(week1Rows.map((r) => r.restaurantId));
	const week4 = new Set(week4Rows.map((r) => r.restaurantId));
	const retainedCount = [...week1].filter((id) => week4.has(id)).length;

	return {
		cohortSize: week1.size,
		retainedCount,
		retentionRate: week1.size === 0 ? null : retainedCount / week1.size,
	};
}

export function isInternalTenant(
	memberEmails: readonly string[],
	isAdmin: (email: string) => boolean = isAdminEmail,
): boolean {
	return memberEmails.some((email) => isAdmin(email) || RESERVED_EMAIL.test(email));
}

function percentileCont(values: number[], p: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const pos = (sorted.length - 1) * p;
	const lower = Math.floor(pos);
	const upper = Math.ceil(pos);
	const lo = sorted[lower] ?? 0;
	const hi = sorted[upper] ?? lo;
	return lo + (hi - lo) * (pos - lower);
}

function minutesBetween(from: Date | null, to: Date | null): number | null {
	if (!from || !to || to.getTime() < from.getTime()) return null;
	return (to.getTime() - from.getTime()) / MINUTE_MS;
}

function rate(count: number, eligible: number): RateStat {
	return { eligible, count, rate: eligible === 0 ? null : count / eligible };
}

interface Tracked {
	row: MilestoneInput;
	out: RestaurantMilestones;
	ageDays: number;
}

function track(row: MilestoneInput, now: Date): Tracked {
	const ageDays = (now.getTime() - row.signupAt.getTime()) / (DAY_MINUTES * MINUTE_MS);
	const insightAfterSignup = minutesBetween(row.signupAt, row.firstInsightAt);
	const out: RestaurantMilestones = {
		id:                 row.id,
		name:               row.name,
		signupAt:           row.signupAt.toISOString(),
		cohortWeek:         row.cohortWeek,
		minutesToUpload:    minutesBetween(row.signupAt, row.firstUploadAt),
		minutesToExtracted: minutesBetween(row.firstUploadAt, row.firstExtractedAt),
		minutesToInsight:   minutesBetween(row.firstUploadAt, row.firstInsightAt),
		activated:          insightAfterSignup !== null && insightAfterSignup <= ACTIVATION_WINDOW_DAYS * DAY_MINUTES,
		weekFour:           row.activeWeekFour ? 'active' : ageDays >= WEEK4_END_DAY ? 'inactive' : 'pending',
	};
	return { row, out, ageDays };
}

const weekFourClosed = (t: Tracked) => t.ageDays >= WEEK4_END_DAY;
const weekFourActive = (t: Tracked) => weekFourClosed(t) && t.out.weekFour === 'active';

function funnelSteps(tracked: Tracked[]): FunnelStep[] {
	const uploaded = tracked.filter((t) => t.row.firstUploadAt);
	const extracted = uploaded.filter((t) => t.row.firstExtractedAt);
	const insight = extracted.filter((t) => t.row.firstInsightAt);
	const weekFourBase = insight.filter(weekFourClosed);
	const signups = tracked.length;
	const counts: Array<[FunnelStepKey, number, number]> = [
		['signup', signups, signups],
		['upload', uploaded.length, signups],
		['extracted', extracted.length, uploaded.length],
		['insight', insight.length, extracted.length],
		['week4', weekFourBase.filter(weekFourActive).length, weekFourBase.length],
	];
	return counts.map(([key, count, base], i) => ({
		key,
		count,
		base,
		rate: i === 0 || base === 0 ? null : count / base,
		share: signups === 0 ? 0 : count / signups,
	}));
}

function timeToInsight(tracked: Tracked[], now: Date): TimeToInsight {
	const uploaders = tracked.filter((t) => t.row.firstUploadAt);
	const minutes = uploaders.map((t) => t.out.minutesToInsight).filter((n): n is number => n !== null);
	const cutoff = now.getTime() - INSIGHT_TARGET_MINUTES * MINUTE_MS;
	const targetBase = uploaders.filter((t) => (t.row.firstUploadAt?.getTime() ?? Infinity) <= cutoff);
	const withinTarget = targetBase.filter((t) => (t.out.minutesToInsight ?? Infinity) <= INSIGHT_TARGET_MINUTES).length;
	const bucket = (key: string, count: number): InsightBucket => ({
		key, count, share: uploaders.length === 0 ? 0 : count / uploaders.length,
	});
	let floor = -Infinity;
	const buckets = INSIGHT_BUCKETS.map(({ key, maxMinutes }) => {
		const count = minutes.filter((n) => n > floor && n <= maxMinutes).length;
		floor = maxMinutes;
		return bucket(key, count);
	});
	buckets.push(bucket('none', uploaders.length - minutes.length));
	return {
		sampleSize:       minutes.length,
		medianMinutes:    percentileCont(minutes, 0.5),
		p75Minutes:       percentileCont(minutes, 0.75),
		uploaders:        uploaders.length,
		targetBase:       targetBase.length,
		withinTarget,
		withinTargetRate: targetBase.length === 0 ? null : withinTarget / targetBase.length,
		buckets,
	};
}

function signupCohorts(tracked: Tracked[]): SignupCohort[] {
	const byWeek = new Map<string, Tracked[]>();
	for (const t of tracked) byWeek.set(t.out.cohortWeek, [...(byWeek.get(t.out.cohortWeek) ?? []), t]);
	return [...byWeek.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.slice(0, COHORT_WEEKS)
		.map(([week, members]) => ({
			week,
			signups:   members.length,
			activated: members.filter((t) => t.out.activated).length,
			weekFour:  rate(members.filter(weekFourActive).length, members.filter(weekFourClosed).length),
		}));
}

export function summarizeFunnel(rows: MilestoneInput[], now: Date, excludedInternal = 0): ActivationFunnel {
	const tracked = rows.map((r) => track(r, now));
	const activationBase = tracked.filter((t) => t.ageDays >= ACTIVATION_WINDOW_DAYS);
	return {
		steps:         funnelSteps(tracked),
		timeToInsight: timeToInsight(tracked, now),
		activation:    rate(activationBase.filter((t) => t.out.activated).length, activationBase.length),
		weekFour:      rate(tracked.filter(weekFourActive).length, tracked.filter(weekFourClosed).length),
		cohorts:       signupCohorts(tracked),
		restaurants:   tracked.map((t) => t.out),
		excludedInternal,
		targetMinutes: INSIGHT_TARGET_MINUTES,
	};
}

const MilestoneRow = v.object({
	id:                 v.string(),
	name:               v.string(),
	signup_at:          v.string(),
	cohort_week:        v.string(),
	member_emails:      v.nullable(v.array(v.string())),
	first_upload_at:    v.nullable(v.string()),
	first_extracted_at: v.nullable(v.string()),
	first_insight_at:   v.nullable(v.string()),
	active_week4:       v.boolean(),
});

const toDate = (x: string | null): Date | null => (x ? new Date(x) : null);

function inWeekFour(at: SQL): SQL {
	return sql`${at} >= restaurants.created_at + make_interval(days => ${WEEK4_START_DAY})
		AND ${at} < restaurants.created_at + make_interval(days => ${WEEK4_END_DAY})`;
}

export async function activationFunnel(now: Date = new Date(), restaurantIds?: string[]): Promise<ActivationFunnel> {
	const scope = restaurantIds ? sql`AND ${inArray(restaurants.id, restaurantIds)}` : sql``;
	// tenant-scope-ok: platform activation funnel — per-restaurant first-upload,
	// first-extraction and first-insight timestamps plus week-4 activity, read
	// across every tenant for the admin activation page only.
	const rows = sqlRows(await db.execute(sql`
		SELECT restaurants.id, restaurants.name, restaurants.created_at AS signup_at,
			to_char(date_trunc('week', restaurants.created_at AT TIME ZONE ${APP_TIMEZONE}), 'YYYY-MM-DD') AS cohort_week,
			(SELECT array_agg(users.email) FROM user_restaurants
				JOIN users ON users.id = user_restaurants.user_id
				WHERE user_restaurants.restaurant_id = restaurants.id) AS member_emails,
			LEAST(
				(SELECT min(batch_items.created_at) FROM batch_items WHERE batch_items.restaurant_id = restaurants.id),
				(SELECT min(usage_events.created_at) FROM usage_events
					WHERE usage_events.restaurant_id = restaurants.id AND usage_events.kind = 'claim')
			) AS first_upload_at,
			LEAST(
				(SELECT min(batch_items.extracted_at) FROM batch_items
					WHERE batch_items.restaurant_id = restaurants.id AND batch_items.extracted_data IS NOT NULL),
				(SELECT min(extraction_results.created_at) FROM extraction_results
					WHERE extraction_results.restaurant_id = restaurants.id AND extraction_results.run_kind = 'live')
			) AS first_extracted_at,
			(SELECT min(system_notifications.created_at) FROM system_notifications
				WHERE system_notifications.restaurant_id = restaurants.id
				AND ${inArray(systemNotifications.notificationType, INSIGHT_TYPES)}) AS first_insight_at,
			(
				EXISTS (SELECT 1 FROM batch_items WHERE batch_items.restaurant_id = restaurants.id
					AND ${inWeekFour(sql`batch_items.created_at`)})
				OR EXISTS (SELECT 1 FROM usage_events WHERE usage_events.restaurant_id = restaurants.id
					AND usage_events.kind = 'claim' AND ${inWeekFour(sql`usage_events.created_at`)})
				OR EXISTS (SELECT 1 FROM invoices WHERE invoices.restaurant_id = restaurants.id
					AND invoices.review_state <> 'por_revisar' AND ${inWeekFour(sql`invoices.created_at`)})
			) AS active_week4
		FROM restaurants
		WHERE restaurants.parent_id IS NULL AND restaurants.created_at IS NOT NULL ${scope}
		ORDER BY restaurants.created_at DESC
	`), MilestoneRow);

	const customers = rows.filter((r) => !isInternalTenant(r.member_emails ?? []));
	return summarizeFunnel(customers.map((r) => ({
		id:               r.id,
		name:             r.name,
		signupAt:         new Date(r.signup_at),
		cohortWeek:       r.cohort_week,
		firstUploadAt:    toDate(r.first_upload_at),
		firstExtractedAt: toDate(r.first_extracted_at),
		firstInsightAt:   toDate(r.first_insight_at),
		activeWeekFour:   r.active_week4,
	})), now, rows.length - customers.length);
}

export async function activationReport(now: Date = new Date()) {
	const funnel = await activationFunnel(now);
	const ids = funnel.restaurants.map((r) => r.id);
	const [timeToValue, weekFourRetentionStats] = await Promise.all([
		timeToValueStats(ids),
		weekFourRetention(now, ids),
	]);
	return {
		timeToValue,
		weekFourRetention: weekFourRetentionStats,
		funnel: { ...funnel, restaurants: funnel.restaurants.slice(0, RECENT_RESTAURANTS) },
	};
}
