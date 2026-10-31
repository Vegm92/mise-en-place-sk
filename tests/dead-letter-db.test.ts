/**
 * Dead letters are pg-boss's own failed jobs. Against a real pg-boss on the
 * test DB: a job that runs out of retries shows up on the admin page's data,
 * the hourly alert counts it, retry re-runs it, and discard removes it.
 *
 * Uses the real account-cleanup queue, since it is the zero-tolerance queue
 * the alert escalates on a single failure. Skipped when the DB gate is closed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PgBoss } from 'pg-boss';
import * as Sentry from '@sentry/sveltekit';
import { hasDbEnv } from './helpers/test-db';
import { ACCOUNT_CLEANUP_QUEUE } from '../src/lib/server/contracts/account-cleanup-contract';

const { FAILED_JOB_RETENTION_SECONDS, createQueues } = await import('../src/lib/server/queue');
const { discardDeadLetter, listDeadLetters, retryDeadLetter } = await import('../src/lib/server/dead-letter');
const { runDeadLetterAlertJob } = await import('../src/lib/server/dead-letter-health');

const QUEUE = ACCOUNT_CLEANUP_QUEUE;
let boss: PgBoss;
let jobId = '';

async function runAndFail(message: string): Promise<void> {
	const [job] = await boss.fetch(QUEUE, { batchSize: 1 }) ?? [];
	expect(job?.id).toBe(jobId);
	await boss.fail(QUEUE, jobId, new Error(message));
}

async function listed() {
	return (await listDeadLetters(QUEUE, 200)).find((e) => e.id === jobId);
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, max: 1 });
	await boss.start();
	await createQueues(boss);
});

afterAll(async () => {
	if (!hasDbEnv) return;
	if (jobId) await boss.deleteJob(QUEUE, jobId);
	await boss.stop({ graceful: false, close: true });
});

describe.skipIf(!hasDbEnv)('dead letters read straight from pg-boss', () => {
	it('keeps failed jobs for the retention window instead of a purge cron', async () => {
		const queue = await boss.getQueue(QUEUE);
		expect(queue?.deleteAfterSeconds).toBe(FAILED_JOB_RETENTION_SECONDS);
		expect(queue?.deadLetter ?? null).toBeNull();
	});

	it('lists a job that exhausted its retries, with why it failed and its payload', async () => {
		jobId = (await boss.send(QUEUE, { userId: 'dlq-test-user', restaurantId: null, apiKey: 'secret' }, {
			retryLimit: 1,
			retryDelay: 0,
		}))!;
		await runAndFail('first try');
		expect(await listed()).toBeUndefined();

		await runAndFail('stripe said no');
		const entry = await listed();
		expect(entry).toMatchObject({
			queue: QUEUE,
			errorMessage: 'stripe said no',
			retryCount: 1,
			payload: { userId: 'dlq-test-user', apiKey: '[redacted]' },
		});
	});

	it('fires the hourly alert for it', async () => {
		vi.mocked(Sentry.captureMessage).mockClear();
		const result = await runDeadLetterAlertJob();
		expect(result.alerted).toBe(true);
		expect(Sentry.captureMessage).toHaveBeenCalledWith(
			'Dead-lettered account deletion',
			expect.objectContaining({ level: 'error' }),
		);
	});

	it('retry re-runs it', async () => {
		expect(await retryDeadLetter(QUEUE, jobId)).toEqual({ ok: true });
		expect(await listed()).toBeUndefined();
		await runAndFail('failed again');
		expect((await listed())?.errorMessage).toBe('failed again');
	});

	it('discard removes it', async () => {
		expect(await discardDeadLetter(QUEUE, jobId)).toEqual({ ok: true });
		expect(await listed()).toBeUndefined();
		expect(await boss.getJobById(QUEUE, jobId)).toBeNull();
		expect(await discardDeadLetter(QUEUE, jobId)).toEqual({ ok: false, error: 'notFound' });
		jobId = '';
	});
});
