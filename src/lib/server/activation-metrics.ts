import { and, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { db } from './db';
import { invoices, restaurants } from './schema';

const REVIEWED = ne(invoices.reviewState, 'por_revisar');
const WEEK4_ELIGIBLE_DAYS = 28;
const WEEK1_START_DAY = 0;
const WEEK1_END_DAY = 7;
const WEEK4_START_DAY = 21;
const WEEK4_END_DAY = 28;

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

export interface ActivationMetrics {
	timeToValue: TimeToValueStats;
	weekFourRetention: WeekFourRetention;
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

export async function activationMetrics(now: Date = new Date(), restaurantIds?: string[]): Promise<ActivationMetrics> {
	const [timeToValue, weekFourRetentionStats] = await Promise.all([
		timeToValueStats(restaurantIds),
		weekFourRetention(now, restaurantIds),
	]);
	return { timeToValue, weekFourRetention: weekFourRetentionStats };
}
