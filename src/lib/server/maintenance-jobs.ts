import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/sveltekit';
import { db, forTenant } from './db';
import { invoices } from './schema';
import { getStorage } from './storage';
import { EXTRACTION_QUEUE } from './contracts/extraction-contract.js';
import { extractionQueueDepth } from './pipeline-stats';
import { METRIC_QUEUE_DEPTH, METRIC_QUEUE_OLDEST, purgeMetrics, recordGauge } from './metrics';
import { sweepIdempotencyKeys } from './idempotency';
import { ANALYTICS_ROLLUP_REFRESHED_FLAG, setFlag } from './app-flags';

export const PURGE_QUEUE = 'scheduled-file-purge';
export const METRIC_SAMPLE_QUEUE = 'scheduled-metric-sample';
export const METRIC_PURGE_QUEUE = 'scheduled-metric-purge';
export const ANALYTICS_REFRESH_QUEUE = 'scheduled-analytics-refresh';
export const IDEMPOTENCY_SWEEP_QUEUE = 'scheduled-idempotency-sweep';

export const PURGE_CRON = '0 3 * * *';
export const METRIC_SAMPLE_CRON = '*/5 * * * *';
export const METRIC_PURGE_CRON = '50 3 * * *';
export const ANALYTICS_REFRESH_CRON = '10 3 * * *';
export const IDEMPOTENCY_SWEEP_CRON = '40 3 * * *';

export const DELETED_FILE_RETENTION_DAYS = 30;

export async function runFilePurgeJob(): Promise<{ purged: number; failed: number }> {
	const cutoff = new Date(Date.now() - DELETED_FILE_RETENTION_DAYS * 86_400_000);
	// tenant-scope-ok: retention purge is a platform-wide background job — it
	// sweeps soft-deleted invoices across every tenant by design, and carries
	// restaurantId through so downstream file deletion stays per-tenant.
	const rows = await db.select({
		id: invoices.id,
		restaurantId: invoices.restaurantId,
		sourceFile: invoices.sourceFile,
	})
		.from(invoices)
		.where(and(
			isNotNull(invoices.deletedAt),
			isNotNull(invoices.sourceFile),
			lt(invoices.deletedAt, cutoff),
		))
		.limit(500);

	let purged = 0;
	let failed = 0;
	for (const row of rows) {
		try {
			await getStorage().delete(row.sourceFile!);
			const tdb = forTenant(row.restaurantId);
			await db.update(invoices)
				.set({ sourceFile: null })
				.where(tdb.scope(invoices.restaurantId, eq(invoices.id, row.id)));
			purged++;
		} catch (err) {
			failed++;
			console.error(`[scheduler] file purge failed for invoice ${row.id} (continuing):`, err);
			Sentry.captureException(err, { tags: { job: 'file-purge' } });
		}
	}
	if (purged || failed) console.info(`[scheduler] file purge: ${purged} purged, ${failed} failed`);
	return { purged, failed };
}

export async function runMetricSampleJob(): Promise<{ items: number; oldestSeconds: number | null }> {
	const depth = await extractionQueueDepth();
	const oldestSeconds = depth.oldestQueuedAt
		? Math.max(0, Math.round((Date.now() - new Date(depth.oldestQueuedAt).getTime()) / 1000))
		: null;

	await recordGauge(METRIC_QUEUE_DEPTH, depth.items, EXTRACTION_QUEUE);
	if (oldestSeconds !== null) await recordGauge(METRIC_QUEUE_OLDEST, oldestSeconds, EXTRACTION_QUEUE);
	if (depth.jobs !== null) await recordGauge(METRIC_QUEUE_DEPTH, depth.jobs, `${EXTRACTION_QUEUE}:pgboss`);

	return { items: depth.items, oldestSeconds };
}

export async function runMetricPurgeJob(): Promise<{ purged: number }> {
	const result = await purgeMetrics();
	if (result.purged) console.info(`[scheduler] metric purge: ${result.purged} samples removed`);
	return result;
}

export async function runIdempotencySweepJob(): Promise<{ swept: number }> {
	const result = await sweepIdempotencyKeys();
	if (result.swept) console.info(`[scheduler] idempotency sweep: ${result.swept} claims expired`);
	return result;
}

export async function runAnalyticsRefreshJob(): Promise<{ refreshed: boolean; refreshedAt: string }> {
	await db.execute(sql`SELECT refresh_analytics_rollups()`);
	const refreshedAt = new Date().toISOString();
	await setFlag(ANALYTICS_ROLLUP_REFRESHED_FLAG, refreshedAt);
	return { refreshed: true, refreshedAt };
}
