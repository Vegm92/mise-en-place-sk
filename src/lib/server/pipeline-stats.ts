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
				COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
			FROM batch_items
			WHERE updated_at > now() - ${window}::interval
		`),
		one(sql`
			SELECT COUNT(*)::int AS timed,
				percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS p50,
				percentile_cont(0.95) WITHIN GROUP (ORDER BY secs) AS p95
			FROM (
				SELECT EXTRACT(EPOCH FROM (er.created_at - bi.queued_at)) AS secs
				FROM extraction_results er
				JOIN batch_items bi ON bi.id = er.batch_item_id
				WHERE er.run_kind = 'live'
					AND bi.queued_at IS NOT NULL
					AND er.created_at > now() - ${window}::interval
			) t
			WHERE secs >= 0
		`),
	]);
	const total = num(outcome.total);
	return {
		windowHours,
		total,
		succeeded: num(outcome.succeeded),
		failed: num(outcome.failed),
		successRate: total > 0 ? num(outcome.succeeded) / total : null,
		timed: num(latency.timed),
		p50Seconds: maybe(latency.p50),
		p95Seconds: maybe(latency.p95),
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
