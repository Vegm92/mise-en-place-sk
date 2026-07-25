/**
 * Worker entry point — run alongside the web process.
 *
 * Dev:  pnpm worker  (vite-node with vite.worker.config.ts)
 * Prod: node build/worker.js  (built via pnpm build:worker)
 *
 * Requires all the same env vars as the web process (DATABASE_URL, GEMINI_API_KEY, etc.).
 * In dev, dotenv/config loads .env automatically (first import below).
 * In prod, the deployment platform injects env vars.
 */

// Must be the first import — populates process.env from .env before any
// other module (db.ts etc.) is evaluated. ESM evaluates imports depth-first
// in source order, so this runs before queue.ts / sessions.ts / db.ts.
import 'dotenv/config';

import * as Sentry from '@sentry/sveltekit';
import { PgBoss } from 'pg-boss';
import { EXTRACTION_QUEUE, NORMALIZE_QUEUE } from './lib/server/queue.js';
import { pgSslConfig } from './lib/server/db-ssl.js';
import { processExtractionJob, type ExtractionJobData } from './lib/server/extraction-worker.js';
import { processNormalizeJob, type NormalizeJobData } from './lib/server/product-normalizer.js';
import { registerScheduledJobs } from './lib/server/scheduler.js';

// The worker runs the core product loop (Gemini extraction) on a box nobody
// watches. Without Sentry a crash or every-job-failing state is invisible until
// a customer complains (issue #252). Same config as hooks.server.ts.
Sentry.init({
	dsn: process.env.SENTRY_DSN ?? '',
	tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
	sendDefaultPii: false,
});

// An unexpected throw or rejection would otherwise kill the process silently.
// Report it, flush, then exit non-zero so the platform restarts the worker.
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
	// Same TLS policy as the web pool (issue #295) — this used to skip
	// certificate verification unconditionally while the web process did not.
	ssl: pgSslConfig(),
	max: 3,
});

boss.on('error', (err) => {
	console.error('[worker] pg-boss error:', err);
	Sentry.captureException(err);
});

await boss.start();
// pg-boss v10+ no longer auto-creates queues; work() requires the queue
// to exist first. createQueue is idempotent.
await boss.createQueue(EXTRACTION_QUEUE);
await boss.createQueue(NORMALIZE_QUEUE);
console.info('[worker] pg-boss started');

// batchSize 1 — extractions run strictly one-by-one. Parallel extraction
// multiplies Gemini rate-limit pressure and contradicts the sequential design.
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

// Low-priority LLM product normalization (issue #300). Best-effort — the
// handler swallows its own errors, so a failed suggestion never retries noisily.
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

// Cron-driven work — weekly digest, overdue reminders, trial notices and the
// deleted-file purge (issues #288/#289). Registered here because pg-boss holds
// the schedule in the database: whichever worker is up fires the occurrence.
await registerScheduledJobs(boss);

async function shutdown() {
	console.info('[worker] Shutting down…');
	await boss.stop();
	process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
