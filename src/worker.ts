/**
 * Worker entry point — run alongside the web process.
 *
 * Dev:  npx vite-node src/worker.ts
 * Prod: node build/worker.js  (built via `npm run build:worker`)
 *
 * Requires all the same env vars as the web process (DATABASE_URL, GEMINI_API_KEY, etc.).
 * Load them via .env or your deployment platform before starting.
 */

// In dev, vite-node loads .env; in prod, the deployment platform sets env vars.
// Use dotenv only when not already set (e.g. local dev without vite-node).
if (!process.env.DATABASE_URL) {
	const { config } = await import('dotenv');
	config();
}

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
