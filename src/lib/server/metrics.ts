import { lt } from 'drizzle-orm';
import { db } from './db';
import { metricSamples } from './schema';

export const METRIC_ROUTE_LATENCY = 'route.latency_ms';
export const METRIC_QUEUE_DEPTH = 'queue.depth';
export const METRIC_QUEUE_OLDEST = 'queue.oldest_seconds';
export const METRIC_EXTRACTION_LATENCY = 'extraction.latency_seconds';

export const METRIC_RETENTION_DAYS = 30;

export const METRIC_FLUSH_INTERVAL_MS = parseInt(process.env.METRIC_FLUSH_INTERVAL_MS ?? '60000', 10);

interface Bucket {
	count: number;
	sum: number;
	min: number;
	max: number;
}

interface Sample extends Bucket {
	name: string;
	label: string | null;
}

const buckets = new Map<string, Sample>();

const keyOf = (name: string, label: string | null) => JSON.stringify([name, label]);

export function observe(name: string, value: number, label: string | null = null): void {
	if (!Number.isFinite(value)) return;
	const key = keyOf(name, label);
	const bucket = buckets.get(key);
	if (!bucket) {
		buckets.set(key, { name, label, count: 1, sum: value, min: value, max: value });
		return;
	}
	bucket.count++;
	bucket.sum += value;
	if (value < bucket.min) bucket.min = value;
	if (value > bucket.max) bucket.max = value;
}

export function drain(): Sample[] {
	const rows = [...buckets.values()];
	buckets.clear();
	return rows;
}

export async function flushMetrics(): Promise<number> {
	const rows = drain();
	if (rows.length === 0) return 0;
	try {
		await db.insert(metricSamples).values(rows.map((r) => ({
			name: r.name,
			label: r.label,
			count: r.count,
			sum: r.sum,
			min: r.min,
			max: r.max,
		})));
		return rows.length;
	} catch (err) {
		console.error('[metrics] flush failed, dropping samples (non-fatal):', err);
		return 0;
	}
}

export async function recordGauge(name: string, value: number, label: string | null = null): Promise<void> {
	if (!Number.isFinite(value)) return;
	try {
		await db.insert(metricSamples).values({ name, label, count: 1, sum: value, min: value, max: value });
	} catch (err) {
		console.error(`[metrics] gauge ${name} failed (non-fatal):`, err);
	}
}

export async function purgeMetrics(retentionDays = METRIC_RETENTION_DAYS): Promise<{ purged: number }> {
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
	const rows = await db
		.delete(metricSamples)
		.where(lt(metricSamples.at, cutoff))
		.returning({ id: metricSamples.id });
	return { purged: rows.length };
}

export function startMetricFlush(): () => void {
	if (process.env.VITEST || process.env.NODE_ENV === 'test') return () => { };
	const timer = setInterval(() => {
		flushMetrics().catch((err) => console.error('[metrics] flush failed:', err));
	}, METRIC_FLUSH_INTERVAL_MS);
	timer.unref?.();
	return () => clearInterval(timer);
}
