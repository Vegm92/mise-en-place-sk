import 'dotenv/config';

import * as Sentry from '@sentry/sveltekit';
import { PgBoss } from 'pg-boss';
import { EXTRACTION_QUEUE, NORMALIZE_QUEUE } from './lib/server/queue.js';
import { pgSslConfig } from './lib/server/db-ssl.js';
import { processExtractionJob, type ExtractionJobData } from './lib/server/extraction-worker.js';
import { processNormalizeJob, type NormalizeJobData } from './lib/server/product-normalizer.js';
import { registerScheduledJobs } from './lib/server/alerts.js';

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
await boss.createQueue(EXTRACTION_QUEUE);
await boss.createQueue(NORMALIZE_QUEUE);
console.info('[worker] pg-boss started');

await boss.work<ExtractionJobData>(
	EXTRACTION_QUEUE,
	{ batchSize: 1 },
	async (jobs) => {
		for (const job of jobs) {
			await processExtractionJob(job.data);
		}
	},
);
console.info(`[worker] Listening for "${EXTRACTION_QUEUE}" jobs`);

await boss.work<NormalizeJobData>(
	NORMALIZE_QUEUE,
	{ batchSize: 1 },
	async (jobs) => {
		for (const job of jobs) {
			await processNormalizeJob(job.data);
		}
	},
);
console.info(`[worker] Listening for "${NORMALIZE_QUEUE}" jobs`);

await registerScheduledJobs(boss);

async function shutdown() {
	console.info('[worker] Shutting down…');
	await boss.stop();
	process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
