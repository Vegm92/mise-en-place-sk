import { sql } from 'drizzle-orm';
import { db } from './db';
import { EXTRACTION_QUEUE } from './queue';
import { STRIPE_WEBHOOK_SCOPE } from './idempotency';

type Row = Record<string, unknown>;

const num = (v: unknown): number => Number(v ?? 0);
const iso = (v: unknown): string | null => (v ? new Date(String(v)).toISOString() : null);
const maybe = (v: unknown): number | null => (v == null ? null : Number(v));

async function one(query: ReturnType<typeof sql>): Promise<Row> {
	const rows = await db.execute(query);
	return (rows as unknown as Row[])[0] ?? {};
}

export interface ExtractionStats {
	windowHours: number;
	total: number;
	succeeded: number;
	failed: number;
	successRate: number | null;
	userRejected: number;
	reviewed: number;
	rejectionRate: number | null;
	timed: number;
	p50Seconds: number | null;
	p95Seconds: number | null;
}

export async function extractionStats(windowHours = 24): Promise<ExtractionStats> {
	const window = `${windowHours} hours`;
	const [outcome, latency] = await Promise.all([
		one(sql`
			SELECT
				COUNT(*) FILTER (WHERE status IN ('done', 'confirmed', 'failed'))::int AS total,
				COUNT(*) FILTER (WHERE status IN ('done', 'confirmed'))::int AS succeeded,
				COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
				COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
				COUNT(*) FILTER (
					WHERE status = 'discarded' AND discarded_reason = 'user_rejected'
				)::int AS user_rejected
			FROM batch_items
			WHERE updated_at > now() - ${window}::interval
		`),
		one(sql`
			SELECT COUNT(*)::int AS timed,
				percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS p50,
				percentile_cont(0.95) WITHIN GROUP (ORDER BY secs) AS p95
			FROM (
				SELECT EXTRACT(EPOCH FROM (extracted_at - queued_at)) AS secs
				FROM batch_items
				WHERE queued_at IS NOT NULL
					AND extracted_at IS NOT NULL
					AND extracted_at > now() - ${window}::interval
			) t
			WHERE secs >= 0
		`),
	]);
	const total = num(outcome.total);
	const userRejected = num(outcome.user_rejected);
	const reviewed = num(outcome.confirmed) + userRejected;
	return {
		windowHours,
		total,
		succeeded: num(outcome.succeeded),
		failed: num(outcome.failed),
		successRate: total > 0 ? num(outcome.succeeded) / total : null,
		userRejected,
		reviewed,
		rejectionRate: reviewed > 0 ? userRejected / reviewed : null,
		timed: num(latency.timed),
		p50Seconds: maybe(latency.p50),
		p95Seconds: maybe(latency.p95),
	};
}

export interface ReviewBacklog {
	items: number;
	tenants: number;
	oldestAt: string | null;
	oldestAgeHours: number | null;
	staleAfterHours: number;
	staleItems: number;
	staleTenants: number;
}

export async function reviewBacklog(staleAfterHours = 168): Promise<ReviewBacklog> {
	const stale = `${staleAfterHours} hours`;
	const row = await one(sql`
		SELECT
			COUNT(*)::int AS items,
			COUNT(DISTINCT restaurant_id)::int AS tenants,
			MIN(COALESCE(extracted_at, updated_at)) AS oldest_at,
			COUNT(*) FILTER (
				WHERE COALESCE(extracted_at, updated_at) < now() - ${stale}::interval
			)::int AS stale_items,
			COUNT(DISTINCT restaurant_id) FILTER (
				WHERE COALESCE(extracted_at, updated_at) < now() - ${stale}::interval
			)::int AS stale_tenants
		FROM batch_items
		WHERE status = 'done'
	`);
	const oldestAt = iso(row.oldest_at);
	return {
		items: num(row.items),
		tenants: num(row.tenants),
		oldestAt,
		oldestAgeHours: oldestAt ? (Date.now() - new Date(oldestAt).getTime()) / 3_600_000 : null,
		staleAfterHours,
		staleItems: num(row.stale_items),
		staleTenants: num(row.stale_tenants),
	};
}

export interface QueueDepth {
	items: number;
	oldestQueuedAt: string | null;
	jobs: number | null;
	oldestJobAt: string | null;
}

export async function extractionQueueDepth(): Promise<QueueDepth> {
	const items = await one(sql`
		SELECT COUNT(*)::int AS depth, MIN(queued_at) AS oldest
		FROM batch_items WHERE status IN ('queued', 'extracting')
	`);
	let jobs: number | null = null;
	let oldestJobAt: string | null = null;
	try {
		const job = await one(sql`
			SELECT COUNT(*)::int AS pending, MIN(created_on) AS oldest
			FROM pgboss.job
			WHERE name = ${EXTRACTION_QUEUE} AND state IN ('created', 'retry', 'active')
		`);
		jobs = num(job.pending);
		oldestJobAt = iso(job.oldest);
	} catch {
		jobs = null;
	}
	return { items: num(items.depth), oldestQueuedAt: iso(items.oldest), jobs, oldestJobAt };
}

export interface JobFailureStats {
	windowHours: number;
	completed: number;
	failed: number;
	failureRate: number | null;
}

export async function jobFailureStats(windowHours = 24): Promise<JobFailureStats> {
	const row = await one(sql`
		SELECT COUNT(*) FILTER (WHERE state = 'completed')::int AS completed,
			COUNT(*) FILTER (WHERE state = 'failed')::int AS failed
		FROM pgboss.job
		WHERE created_on > now() - ${`${windowHours} hours`}::interval
	`);
	const completed = num(row.completed);
	const failed = num(row.failed);
	const total = completed + failed;
	return { windowHours, completed, failed, failureRate: total > 0 ? failed / total : null };
}

export interface StripeWebhookFreshness {
	lastReceivedAt: string | null;
	received24h: number;
	lastSubscriptionEventAt: string | null;
	stripeSubscriptions: number;
}

export async function stripeWebhookFreshness(): Promise<StripeWebhookFreshness> {
	const [claims, subs] = await Promise.all([
		one(sql`
			SELECT MAX(claimed_at) AS last_at,
				COUNT(*) FILTER (WHERE claimed_at > now() - interval '24 hours')::int AS last_24h
			FROM idempotency_keys WHERE scope = ${STRIPE_WEBHOOK_SCOPE}
		`),
		one(sql`
			SELECT MAX(last_event_at) AS last_event_at,
				COUNT(*) FILTER (WHERE stripe_subscription_id IS NOT NULL)::int AS with_stripe
			FROM subscriptions
		`),
	]);
	return {
		lastReceivedAt: iso(claims.last_at),
		received24h: num(claims.last_24h),
		lastSubscriptionEventAt: iso(subs.last_event_at),
		stripeSubscriptions: num(subs.with_stripe),
	};
}

export async function pendingAccessCount(): Promise<number> {
	const row = await one(sql`SELECT COUNT(*)::int AS n FROM users WHERE access_status = 'pending'`);
	return num(row.n);
}

export interface RestaurantActivity {
	id: string;
	name: string;
	createdAt: string;
	invoices: number;
	suppliers: number;
	invoices7d: number;
	uploads7d: number;
	lastActivityAt: string | null;
}

export async function restaurantActivity(limit = 12): Promise<RestaurantActivity[]> {
	const rows = await db.execute(sql`
		SELECT r.id, r.name, r.created_at,
			(SELECT COUNT(*) FROM invoices i WHERE i.restaurant_id = r.id)::int AS invoices,
			(SELECT COUNT(*) FROM suppliers s WHERE s.restaurant_id = r.id)::int AS suppliers,
			(SELECT COUNT(*) FROM invoices i WHERE i.restaurant_id = r.id
				AND i.created_at > now() - interval '7 days')::int AS invoices_7d,
			(SELECT COUNT(*) FROM batch_items b WHERE b.restaurant_id = r.id
				AND b.created_at > now() - interval '7 days')::int AS uploads_7d,
			GREATEST(
				(SELECT MAX(i.created_at) FROM invoices i WHERE i.restaurant_id = r.id),
				(SELECT MAX(b.created_at) FROM batch_items b WHERE b.restaurant_id = r.id)
			) AS last_activity_at
		FROM restaurants r
		ORDER BY COALESCE(GREATEST(
			(SELECT MAX(i.created_at) FROM invoices i WHERE i.restaurant_id = r.id),
			(SELECT MAX(b.created_at) FROM batch_items b WHERE b.restaurant_id = r.id)
		), r.created_at) DESC
		LIMIT ${limit}
	`);
	return (rows as unknown as Row[]).map((r) => ({
		id: String(r.id),
		name: String(r.name ?? ''),
		createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
		invoices: num(r.invoices),
		suppliers: num(r.suppliers),
		invoices7d: num(r.invoices_7d),
		uploads7d: num(r.uploads_7d),
		lastActivityAt: iso(r.last_activity_at),
	}));
}
