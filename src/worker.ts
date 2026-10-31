import './lib/server/env-file.js';

import * as Sentry from '@sentry/sveltekit';
import { PgBoss, type JobWithMetadata } from 'pg-boss';
import { createQueues } from './lib/server/queue.js';
import { EXTRACTION_QUEUE, type ExtractionJobData, type LegacyExtractionJobData } from './lib/server/contracts/extraction-contract.js';
import {
	NORMALIZE_QUEUE,
	CATEGORIZE_QUEUE,
	type CategorizeJobData,
	type NormalizeJobData,
} from './lib/server/contracts/products-contract.js';
import {
	WHATSAPP_NOTIFY_QUEUE,
	type WhatsAppNotifyJobData,
} from './lib/server/contracts/whatsapp-contract.js';
import {
	ACCOUNT_CLEANUP_QUEUE,
	type AccountCleanupJobData,
	type LegacyAccountCleanupJobData,
} from './lib/server/contracts/account-cleanup-contract.js';
import { pgSslConfig } from './lib/server/db-ssl.js';
import { runExtractionJobForBoss } from './lib/server/extraction-worker.js';
import { processCategorizeJob, processNormalizeJob } from './lib/server/products.js';
import { processAccountCleanupJob } from './lib/server/account-cleanup.js';
import { registerScheduledJobs } from './lib/server/scheduler.js';
import { runJob } from './lib/server/dead-letter.js';
import { alertOnDeadLetter } from './lib/server/dead-letter-health.js';
import { assertRoleConfig } from './lib/server/config.js';
import { MAX_CONCURRENT_EXTRACTIONS } from './lib/server/env.js';
import { createLogger } from './lib/server/log.js';
import { recordWorkerHeartbeat, startWorkerHeartbeat } from './lib/server/worker-heartbeat.js';
import { handleInboundMessage } from './lib/server/integrations/whatsapp/message-handler.js';
import { newRequestId } from './lib/server/request-id.js';
import { notifyWhatsAppSender } from './lib/server/integrations/whatsapp/notify.js';
import { startWhatsAppTransport } from './lib/server/integrations/whatsapp/runtime.js';
import type { WhatsAppTransport } from './lib/server/integrations/whatsapp/transport.js';

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
const SENTRY_DSN = process.env.SENTRY_DSN ?? '';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || undefined;
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const log = createLogger('worker');

Sentry.init({
	dsn: SENTRY_DSN,
	release: SENTRY_RELEASE,
	environment: NODE_ENV === 'production' ? 'production' : 'development',
	tracesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
	sendDefaultPii: false,
});

function fatal(kind: string): (err: unknown) => void {
	return (err) => {
		log.error(kind, { err });
		Sentry.captureException(err);
		const exit = () => process.exit(1);
		Promise.resolve(Sentry.flush(2000)).then(exit, exit);
	};
}
process.on('unhandledRejection', fatal('unhandledRejection'));
process.on('uncaughtException', fatal('uncaughtException'));

if (!DATABASE_URL) {
	log.error('DATABASE_URL is required');
	process.exit(1);
}

assertRoleConfig('worker');

const boss = new PgBoss({
	connectionString: DATABASE_URL,
	ssl: pgSslConfig(),
	max: 3,
});

boss.on('error', (err) => {
	log.error('pg-boss error', { err });
	Sentry.captureException(err);
});

await boss.start();
await createQueues(boss);
log.info('pg-boss started');

const stopHeartbeat = startWorkerHeartbeat();
log.info('Heartbeat registered — liveness visible on /admin/health');

const EXTRACTION_BATCH_SIZE = Math.max(1, MAX_CONCURRENT_EXTRACTIONS);
await boss.work(
	EXTRACTION_QUEUE,
	{ batchSize: EXTRACTION_BATCH_SIZE, includeMetadata: true, perJobResults: true },
	async (jobs: JobWithMetadata<ExtractionJobData | LegacyExtractionJobData>[]) => {
		const results = await Promise.all(jobs.map((job) => runExtractionJobForBoss(job)));
		await recordWorkerHeartbeat(jobs.length);
		return results;
	},
);
log.info('Listening for queue jobs', {
	queue: EXTRACTION_QUEUE,
	batchSize: EXTRACTION_BATCH_SIZE,
	globalCap: MAX_CONCURRENT_EXTRACTIONS,
});

await boss.work(
	NORMALIZE_QUEUE,
	{ batchSize: 1, includeMetadata: true },
	async (jobs: JobWithMetadata<NormalizeJobData>[]) => {
		for (const job of jobs) {
			await runJob(job, () => processNormalizeJob(job.data));
		}
		await recordWorkerHeartbeat(jobs.length);
	},
);
log.info('Listening for queue jobs', { queue: NORMALIZE_QUEUE });

await boss.work(
	CATEGORIZE_QUEUE,
	{ batchSize: 1, includeMetadata: true },
	async (jobs: JobWithMetadata<CategorizeJobData>[]) => {
		for (const job of jobs) {
			await runJob(job, () => processCategorizeJob(job.data));
		}
		await recordWorkerHeartbeat(jobs.length);
	},
);
log.info('Listening for queue jobs', { queue: CATEGORIZE_QUEUE });

await boss.work(
	ACCOUNT_CLEANUP_QUEUE,
	{ batchSize: 1, includeMetadata: true },
	async (jobs: JobWithMetadata<AccountCleanupJobData | LegacyAccountCleanupJobData>[]) => {
		for (const job of jobs) {
			await runJob(job, () => processAccountCleanupJob(job.data)).catch((err: unknown) => {
				if (job.retryCount >= job.retryLimit) alertOnDeadLetter(ACCOUNT_CLEANUP_QUEUE);
				throw err;
			});
		}
	},
);
log.info('Listening for queue jobs', { queue: ACCOUNT_CLEANUP_QUEUE });

const whatsapp: WhatsAppTransport | null = await startWhatsAppTransport();
if (whatsapp) {
	whatsapp.onMessage((msg) => handleInboundMessage(msg, whatsapp, newRequestId()));
	await boss.work(
		WHATSAPP_NOTIFY_QUEUE,
		{ batchSize: 1, includeMetadata: true },
		async (jobs: JobWithMetadata<WhatsAppNotifyJobData>[]) => {
			for (const job of jobs) {
				await runJob(job, () => notifyWhatsAppSender(job.data, whatsapp));
			}
		},
	);
	log.info('Listening for queue jobs', { queue: WHATSAPP_NOTIFY_QUEUE });
} else {
	log.info('WhatsApp bot disabled — not starting a transport');
}

await registerScheduledJobs(boss);

async function shutdown() {
	log.info('Shutting down…');
	stopHeartbeat();
	await boss.stop();
	await whatsapp?.stop().catch((err) => log.error('WhatsApp transport stop failed', { err }));
	process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
