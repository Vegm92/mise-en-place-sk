import 'dotenv/config';

import * as Sentry from '@sentry/sveltekit';
import { PgBoss, type JobWithMetadata } from 'pg-boss';
import {
	DEAD_LETTER_QUEUES,
	EXTRACTION_QUEUE,
	NORMALIZE_QUEUE,
	CATEGORIZE_QUEUE,
	WHATSAPP_NOTIFY_QUEUE,
	ACCOUNT_CLEANUP_QUEUE,
	createQueuesWithDeadLetters,
} from './lib/server/queue.js';
import { pgSslConfig } from './lib/server/db-ssl.js';
import { processExtractionJob, type ExtractionJobData } from './lib/server/extraction-worker.js';
import {
	processCategorizeJob,
	processNormalizeJob,
	type CategorizeJobData,
	type NormalizeJobData,
} from './lib/server/products.js';
import { processAccountCleanupJob, type AccountCleanupJobData } from './lib/server/account-cleanup.js';
import { registerScheduledJobs } from './lib/server/alerts.js';
import { deadLetterRefFromJob, recordDeadLetter, runWithDeadLetter } from './lib/server/dead-letter.js';
import { MAX_CONCURRENT_EXTRACTIONS } from './lib/server/env.js';
import { recordWorkerHeartbeat, startWorkerHeartbeat } from './lib/server/worker-heartbeat.js';
import { handleInboundMessage } from './lib/server/integrations/whatsapp/message-handler.js';
import { notifyWhatsAppSender, type WhatsAppNotifyJobData } from './lib/server/integrations/whatsapp/notify.js';
import { startWhatsAppTransport } from './lib/server/integrations/whatsapp/runtime.js';
import type { WhatsAppTransport } from './lib/server/integrations/whatsapp/transport.js';

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
const SENTRY_DSN = process.env.SENTRY_DSN ?? '';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || undefined;
const DATABASE_URL = process.env.DATABASE_URL ?? '';

Sentry.init({
	dsn: SENTRY_DSN,
	release: SENTRY_RELEASE,
	environment: NODE_ENV === 'production' ? 'production' : 'development',
	tracesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
	sendDefaultPii: false,
});

function fatal(kind: string): (err: unknown) => void {
	return (err) => {
		console.error(`[worker] ${kind}:`, err);
		Sentry.captureException(err);
		const exit = () => process.exit(1);
		Promise.resolve(Sentry.flush(2000)).then(exit, exit);
	};
}
process.on('unhandledRejection', fatal('unhandledRejection'));
process.on('uncaughtException', fatal('uncaughtException'));

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

const stopHeartbeat = startWorkerHeartbeat();
console.info('[worker] Heartbeat registered — liveness visible on /admin/health');

const EXTRACTION_BATCH_SIZE = Math.max(1, MAX_CONCURRENT_EXTRACTIONS);
await boss.work(
	EXTRACTION_QUEUE,
	{ batchSize: EXTRACTION_BATCH_SIZE, includeMetadata: true },
	async (jobs: JobWithMetadata<ExtractionJobData>[]) => {
		await Promise.all(
			jobs.map((job) =>
				runWithDeadLetter(
					deadLetterRefFromJob(EXTRACTION_QUEUE, job),
					() => processExtractionJob(job.data, undefined, {
						retryCount: job.retryCount,
						retryLimit: job.retryLimit,
					}),
				),
			),
		);
		await recordWorkerHeartbeat(jobs.length);
	},
);
console.info(
	`[worker] Listening for "${EXTRACTION_QUEUE}" jobs (batchSize ${EXTRACTION_BATCH_SIZE}, ` +
	`global cap ${MAX_CONCURRENT_EXTRACTIONS})`,
);

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
		await recordWorkerHeartbeat(jobs.length);
	},
);
console.info(`[worker] Listening for "${NORMALIZE_QUEUE}" jobs`);

await boss.work(
	CATEGORIZE_QUEUE,
	{ batchSize: 1, includeMetadata: true },
	async (jobs: JobWithMetadata<CategorizeJobData>[]) => {
		for (const job of jobs) {
			await runWithDeadLetter(
				deadLetterRefFromJob(CATEGORIZE_QUEUE, job),
				() => processCategorizeJob(job.data),
			);
		}
		await recordWorkerHeartbeat(jobs.length);
	},
);
console.info(`[worker] Listening for "${CATEGORIZE_QUEUE}" jobs`);

await boss.work(
	ACCOUNT_CLEANUP_QUEUE,
	{ batchSize: 1, includeMetadata: true },
	async (jobs: JobWithMetadata<AccountCleanupJobData>[]) => {
		for (const job of jobs) {
			await runWithDeadLetter(
				deadLetterRefFromJob(ACCOUNT_CLEANUP_QUEUE, job),
				() => processAccountCleanupJob(job.data),
			);
		}
	},
);
console.info(`[worker] Listening for "${ACCOUNT_CLEANUP_QUEUE}" jobs`);

const whatsapp: WhatsAppTransport | null = await startWhatsAppTransport();
if (whatsapp) {
	whatsapp.onMessage((msg) => handleInboundMessage(msg, whatsapp));
	await boss.work(
		WHATSAPP_NOTIFY_QUEUE,
		{ batchSize: 1, includeMetadata: true },
		async (jobs: JobWithMetadata<WhatsAppNotifyJobData>[]) => {
			for (const job of jobs) {
				await runWithDeadLetter(
					deadLetterRefFromJob(WHATSAPP_NOTIFY_QUEUE, job),
					() => notifyWhatsAppSender(job.data, whatsapp),
				);
			}
		},
	);
	console.info(`[worker] Listening for "${WHATSAPP_NOTIFY_QUEUE}" jobs`);
} else {
	console.info('[worker] WhatsApp bot disabled — not starting a transport');
}

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
					skipIfJobRecorded: true,
				});
			}
		},
	);
	console.info(`[worker] Draining "${deadLetter}" into the audit dead-letter queue`);
}

await registerScheduledJobs(boss);

async function shutdown() {
	console.info('[worker] Shutting down…');
	stopHeartbeat();
	await boss.stop();
	await whatsapp?.stop().catch((err) => console.error('[worker] WhatsApp transport stop failed:', err));
	process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
