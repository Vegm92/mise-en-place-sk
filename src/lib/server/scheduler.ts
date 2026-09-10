import type { PgBoss } from 'pg-boss';
import * as Sentry from '@sentry/sveltekit';
import { runAsSystem } from './db';
import { recordDeadLetter } from './dead-letter';
import { registerTenantFanout } from './tenant-fanout';
import { ORPHAN_SUBSCRIPTIONS_CRON, ORPHAN_SUBSCRIPTIONS_QUEUE, runOrphanSubscriptionsJob } from './billing';
import { MRR_SNAPSHOT_CRON, MRR_SNAPSHOT_QUEUE, runMrrSnapshotJob } from './revenue-metrics';
import { EXTRACTION_IMPROVE_CRON, EXTRACTION_IMPROVE_QUEUE, runExtractionImproveJob } from './extraction-improve';
import {
	DIGEST_QUEUE, DIGEST_CRON, DIGEST_TENANT_QUEUE,
	REMINDERS_QUEUE, REMINDERS_CRON, REMINDERS_TENANT_QUEUE,
	TRIAL_QUEUE, TRIAL_CRON, TRIAL_TENANT_QUEUE,
	TENANT_FANOUT_QUEUES,
	runWeeklyDigestJob, sendWeeklyDigest,
	runOverdueRemindersJob, sendOverdueReminder,
	runTrialNoticesJob, sendTrialNotice,
	type WeeklyDigestJobData, type OverdueReminderJobData, type TrialNoticeJobData,
} from './tenant-notification-jobs';
import {
	DEAD_LETTER_PURGE_QUEUE, DEAD_LETTER_PURGE_CRON, runDeadLetterPurgeJob,
	DEAD_LETTER_ALERT_QUEUE, DEAD_LETTER_ALERT_CRON, runDeadLetterAlertJob,
} from './dead-letter-health';
import {
	PURGE_QUEUE, PURGE_CRON, runFilePurgeJob,
	METRIC_SAMPLE_QUEUE, METRIC_SAMPLE_CRON, runMetricSampleJob,
	METRIC_PURGE_QUEUE, METRIC_PURGE_CRON, runMetricPurgeJob,
	ANALYTICS_REFRESH_QUEUE, ANALYTICS_REFRESH_CRON, runAnalyticsRefreshJob,
	IDEMPOTENCY_SWEEP_QUEUE, IDEMPOTENCY_SWEEP_CRON, runIdempotencySweepJob,
} from './maintenance-jobs';

interface ScheduledJob {
	queue: string;
	cron: string;
	run: (boss: PgBoss) => Promise<unknown>;
}

const JOBS: ScheduledJob[] = [
	{ queue: DIGEST_QUEUE, cron: DIGEST_CRON, run: runWeeklyDigestJob },
	{ queue: REMINDERS_QUEUE, cron: REMINDERS_CRON, run: runOverdueRemindersJob },
	{ queue: TRIAL_QUEUE, cron: TRIAL_CRON, run: runTrialNoticesJob },
	{ queue: PURGE_QUEUE, cron: PURGE_CRON, run: runFilePurgeJob },
	{ queue: MRR_SNAPSHOT_QUEUE, cron: MRR_SNAPSHOT_CRON, run: runMrrSnapshotJob },
	{ queue: DEAD_LETTER_PURGE_QUEUE, cron: DEAD_LETTER_PURGE_CRON, run: runDeadLetterPurgeJob },
	{ queue: DEAD_LETTER_ALERT_QUEUE, cron: DEAD_LETTER_ALERT_CRON, run: runDeadLetterAlertJob },
	{ queue: METRIC_SAMPLE_QUEUE, cron: METRIC_SAMPLE_CRON, run: runMetricSampleJob },
	{ queue: METRIC_PURGE_QUEUE, cron: METRIC_PURGE_CRON, run: runMetricPurgeJob },
	{ queue: ANALYTICS_REFRESH_QUEUE, cron: ANALYTICS_REFRESH_CRON, run: runAnalyticsRefreshJob },
	{ queue: IDEMPOTENCY_SWEEP_QUEUE, cron: IDEMPOTENCY_SWEEP_CRON, run: runIdempotencySweepJob },
	{ queue: ORPHAN_SUBSCRIPTIONS_QUEUE, cron: ORPHAN_SUBSCRIPTIONS_CRON, run: runOrphanSubscriptionsJob },
	{ queue: EXTRACTION_IMPROVE_QUEUE, cron: EXTRACTION_IMPROVE_CRON, run: runExtractionImproveJob },
];

export async function registerScheduledJobs(boss: PgBoss): Promise<void> {
	await registerTenantFanout<WeeklyDigestJobData>(boss, {
		queue: DIGEST_TENANT_QUEUE, label: 'weekly-digest', run: sendWeeklyDigest,
	});
	await registerTenantFanout<OverdueReminderJobData>(boss, {
		queue: REMINDERS_TENANT_QUEUE, label: 'overdue-reminders', run: sendOverdueReminder,
	});
	await registerTenantFanout<TrialNoticeJobData>(boss, {
		queue: TRIAL_TENANT_QUEUE, label: 'trial-notices', run: sendTrialNotice,
	});
	console.info(`[scheduler] ${TENANT_FANOUT_QUEUES.length} per-tenant queues registered (${TENANT_FANOUT_QUEUES.join(', ')})`);

	for (const job of JOBS) {
		await boss.createQueue(job.queue);
		await boss.schedule(job.queue, job.cron, {}, { tz: 'UTC' });
		await boss.work(job.queue, { batchSize: 1 }, async () => {
			const started = Date.now();
			try {
				const result = await runAsSystem(() => job.run(boss));
				console.info(`[scheduler] ${job.queue} finished in ${Date.now() - started}ms`, result);
			} catch (err) {
				console.error(`[scheduler] ${job.queue} failed after ${Date.now() - started}ms — dead-lettered:`, err);
				Sentry.captureException(err, { tags: { job: job.queue } });
				await recordDeadLetter({ queue: job.queue, error: err, sourceId: job.queue });
				throw err;
			}
		});
	}
	console.info(`[scheduler] ${JOBS.length} scheduled jobs registered (${JOBS.map(j => j.queue).join(', ')})`);
}
