import { PgBoss } from 'pg-boss';
import { pgSslConfig } from './db-ssl.js';
import { storageFingerprint } from './env.js';

export const FAILED_JOB_RETENTION_SECONDS = 30 * 24 * 60 * 60;

import {
	type WhatsAppNotifyJobData,
	WHATSAPP_NOTIFY_QUEUE,
	WHATSAPP_INBOUND_QUEUE,
	WHATSAPP_NOTIFY_OPTIONS,
} from './contracts/whatsapp-contract.js';

import {
	type ExtractionJobData,
	EXTRACTION_QUEUE,
	EXTRACTION_OPTIONS,
} from './contracts/extraction-contract.js';

import {
	type CategorizeJobData,
	type NormalizeJobData,
	NORMALIZE_QUEUE,
	CATEGORIZE_QUEUE,
	NORMALIZE_OPTIONS,
	CATEGORIZE_OPTIONS,
} from './contracts/products-contract.js';

import {
	type AccountCleanupJobData,
	ACCOUNT_CLEANUP_QUEUE,
	ACCOUNT_CLEANUP_OPTIONS,
} from './contracts/account-cleanup-contract.js';

export {
	EXTRACTION_QUEUE,
	NORMALIZE_QUEUE,
	CATEGORIZE_QUEUE,
	WHATSAPP_NOTIFY_QUEUE,
	WHATSAPP_INBOUND_QUEUE,
	ACCOUNT_CLEANUP_QUEUE,
};

export const JOB_QUEUES = [EXTRACTION_QUEUE, NORMALIZE_QUEUE, CATEGORIZE_QUEUE, WHATSAPP_NOTIFY_QUEUE, ACCOUNT_CLEANUP_QUEUE];

export async function createQueues(b: PgBoss): Promise<void> {
	for (const queue of JOB_QUEUES) {
		await b.createQueue(queue);
		await b.updateQueue(queue, { deadLetter: null, deleteAfterSeconds: FAILED_JOB_RETENTION_SECONDS });
	}
}

let boss: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
	if (boss) return boss;
	if (!startPromise) {
		startPromise = (async () => {
			const connectionString = process.env.DATABASE_URL ?? '';
			if (!connectionString) throw new Error('DATABASE_URL is required');
			const b = new PgBoss({
				connectionString,
				ssl: pgSslConfig(),
				max: 2,
			});
			await b.start();
			await createQueues(b);
			boss = b;
			return b;
		})();
	}
	return startPromise;
}

export async function enqueueExtraction(
	itemId: string,
	restaurantId: string,
	requestId?: string,
): Promise<boolean> {
	const b = await getBoss();
	const data: ExtractionJobData = { itemId, restaurantId, requestId, storageFingerprint: storageFingerprint() };
	const jobId = await b.send(EXTRACTION_QUEUE, data, EXTRACTION_OPTIONS(itemId));
	return jobId !== null;
}

export async function enqueueNormalize(
	restaurantId: string,
	productId: number,
	rawText: string,
	requestId?: string,
): Promise<boolean> {
	const b = await getBoss();
	const data: NormalizeJobData = { restaurantId, productId, rawText, requestId };
	const jobId = await b.send(NORMALIZE_QUEUE, data, NORMALIZE_OPTIONS(restaurantId, productId));
	return jobId !== null;
}

export async function enqueueCategorize(
	restaurantId: string,
	productId: number,
	canonicalName: string,
	requestId?: string,
): Promise<boolean> {
	const b = await getBoss();
	const data: CategorizeJobData = { restaurantId, productId, canonicalName, requestId };
	const jobId = await b.send(CATEGORIZE_QUEUE, data, CATEGORIZE_OPTIONS(restaurantId, productId));
	return jobId !== null;
}

export async function enqueueWhatsAppNotify(
	itemId: string,
	restaurantId: string,
	requestId?: string,
): Promise<boolean> {
	const b = await getBoss();
	const data: WhatsAppNotifyJobData = { itemId, restaurantId, requestId };
	const jobId = await b.send(WHATSAPP_NOTIFY_QUEUE, data, WHATSAPP_NOTIFY_OPTIONS(itemId));
	return jobId !== null;
}

export async function enqueueAccountCleanup(
	userId: string,
	restaurantId: string | null,
	stripeSubscriptionIds: string[],
	storageKeys: string[],
	requestId?: string,
): Promise<boolean> {
	const b = await getBoss();
	const data: AccountCleanupJobData = { userId, restaurantId, stripeSubscriptionIds, storageKeys, requestId };
	const jobId = await b.send(ACCOUNT_CLEANUP_QUEUE, data, ACCOUNT_CLEANUP_OPTIONS(userId));
	return jobId !== null;
}
