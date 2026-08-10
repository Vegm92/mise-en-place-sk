import 'dotenv/config';

import * as Sentry from '@sentry/sveltekit';
import { PgBoss, type JobWithMetadata } from 'pg-boss';
import {
	DEAD_LETTER_QUEUES,
	EXTRACTION_QUEUE,
	NORMALIZE_QUEUE,
	createQueuesWithDeadLetters,
} from './lib/server/queue.js';
import { pgSslConfig } from './lib/server/db-ssl.js';
import { processExtractionJob, type ExtractionJobData } from './lib/server/extraction-worker.js';
import { processNormalizeJob, type NormalizeJobData } from './lib/server/products.js';
import { registerScheduledJobs } from './lib/server/alerts.js';
import { deadLetterRefFromJob, recordDeadLetter, runWithDeadLetter } from './lib/server/dead-letter.js';

Sentry.init({
	dsn: process.env.SENTRY_DSN ?? '',
	tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
	sendDefaultPii: false,
});

function fatal(kind: string): (err: unknown) => void {
	return (err) => {
		console.error(`[worker] ${kind}:`, err);
		Sentry.captureException(err);
		void Promise.resolve(Sentry.flush(2000)).then(
			() => process.exit(1),
			() => process.exit(1),
		);
	};
}
process.on('unhandledRejection', fatal('unhandledRejection'));
process.on('uncaughtException', fatal('uncaughtException'));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('[worker] DATABASE_URL is required');
	process.exit(1);
}

const boss = new PgBoss({
	connectionString: DATABASE_URL,
	ssl: pgSslConfig(),
	max: 3,
});

boss.on('error', (err) => {
	console.error('[worker] pg-boss error:', err);
	Sentry.captureException(err);
});

await boss.start();
await createQueuesWithDeadLetters(boss);
console.info('[worker] pg-boss started');

await boss.work(
	EXTRACTION_QUEUE,
	{ batchSize: 1, includeMetadata: true },
	async (jobs: JobWithMetadata<ExtractionJobData>[]) => {
		for (const job of jobs) {
			await runWithDeadLetter(
				deadLetterRefFromJob(EXTRACTION_QUEUE, job),
				() => processExtractionJob(job.data),
			);
		}
	},
);
console.info(`[worker] Listening for "${EXTRACTION_QUEUE}" jobs`);

await boss.work(
	NORMALIZE_QUEUE,
	{ batchSize: 1, includeMetadata: true },
	async (jobs: JobWithMetadata<NormalizeJobData>[]) => {
		for (const job of jobs) {
			await runWithDeadLetter(
				deadLetterRefFromJob(NORMALIZE_QUEUE, job),
				() => processNormalizeJob(job.data),
			);
		}
	},
);
console.info(`[worker] Listening for "${NORMALIZE_QUEUE}" jobs`);

for (const { source, deadLetter } of DEAD_LETTER_QUEUES) {
	await boss.work(
		deadLetter,
		{ batchSize: 10, includeMetadata: true },
		async (jobs: JobWithMetadata<Record<string, unknown>>[]) => {
			for (const job of jobs) {
				await recordDeadLetter({
					...deadLetterRefFromJob(source, {
						id: job.sourceId ?? job.id,
						data: job.data,
						retryCount: job.sourceRetryCount ?? 0,
						retryLimit: 0,
					}),
					errorClass: 'worker.abandoned',
					error: new Error(`pg-boss dead-lettered a "${source}" job without a handler result (expired or abandoned)`),
				});
			}
		},
	);
	console.info(`[worker] Draining "${deadLetter}" into the audit dead-letter queue`);
}

await registerScheduledJobs(boss);

async function shutdown() {
	console.info('[worker] Shutting down…');
	await boss.stop();
	process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
