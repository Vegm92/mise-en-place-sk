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

import { PgBoss } from 'pg-boss';
import { EXTRACTION_QUEUE } from './lib/server/queue.js';
import { processExtractionJob, type ExtractionJobData } from './lib/server/extraction-worker.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('[worker] DATABASE_URL is required');
	process.exit(1);
}

const boss = new PgBoss({
	connectionString: DATABASE_URL,
	ssl: { rejectUnauthorized: false },
	max: 3,
});

boss.on('error', (err) => console.error('[worker] pg-boss error:', err));

await boss.start();
// pg-boss v10+ no longer auto-creates queues; work() requires the queue
// to exist first. createQueue is idempotent.
await boss.createQueue(EXTRACTION_QUEUE);
console.info('[worker] pg-boss started');

await boss.work<ExtractionJobData>(
	EXTRACTION_QUEUE,
	{ batchSize: 3 },
	async (jobs) => {
		await Promise.all(jobs.map((job) => processExtractionJob(job.data)));
	},
);
console.info(`[worker] Listening for "${EXTRACTION_QUEUE}" jobs`);

async function shutdown() {
	console.info('[worker] Shutting down…');
	await boss.stop();
	process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
