import { PgBoss } from 'pg-boss';
import { pgSslConfig } from './db-ssl.js';
import { storageFingerprint } from './env.js';

import {
	type WhatsAppNotifyJobData,
	WHATSAPP_NOTIFY_QUEUE,
	WHATSAPP_INBOUND_QUEUE,
	WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE,
	WHATSAPP_NOTIFY_OPTIONS,
} from './contracts/whatsapp-contract.js';

import {
	type ExtractionJobData,
	EXTRACTION_QUEUE,
	EXTRACTION_DEAD_LETTER_QUEUE,
	EXTRACTION_OPTIONS,
} from './contracts/extraction-contract.js';

import {
	type CategorizeJobData,
	type NormalizeJobData,
	NORMALIZE_QUEUE,
	NORMALIZE_DEAD_LETTER_QUEUE,
	CATEGORIZE_QUEUE,
	CATEGORIZE_DEAD_LETTER_QUEUE,
	NORMALIZE_OPTIONS,
	CATEGORIZE_OPTIONS,
} from './contracts/products-contract.js';

import {
	type AccountCleanupJobData,
	ACCOUNT_CLEANUP_QUEUE,
	ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE,
	ACCOUNT_CLEANUP_OPTIONS,
} from './contracts/account-cleanup-contract.js';

export {
	EXTRACTION_QUEUE,
	NORMALIZE_QUEUE,
	CATEGORIZE_QUEUE,
	WHATSAPP_NOTIFY_QUEUE,
	WHATSAPP_INBOUND_QUEUE,
	ACCOUNT_CLEANUP_QUEUE,
	EXTRACTION_DEAD_LETTER_QUEUE,
	NORMALIZE_DEAD_LETTER_QUEUE,
	CATEGORIZE_DEAD_LETTER_QUEUE,
	WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE,
	ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE,
};

export const DEAD_LETTER_QUEUES: Array<{ source: string; deadLetter: string }> = [
	{ source: EXTRACTION_QUEUE, deadLetter: EXTRACTION_DEAD_LETTER_QUEUE },
	{ source: NORMALIZE_QUEUE, deadLetter: NORMALIZE_DEAD_LETTER_QUEUE },
	{ source: CATEGORIZE_QUEUE, deadLetter: CATEGORIZE_DEAD_LETTER_QUEUE },
	{ source: WHATSAPP_NOTIFY_QUEUE, deadLetter: WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE },
	{ source: ACCOUNT_CLEANUP_QUEUE, deadLetter: ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE },
];

export async function createQueuesWithDeadLetters(b: PgBoss): Promise<void> {
	for (const { source, deadLetter } of DEAD_LETTER_QUEUES) {
		await b.createQueue(deadLetter);
		await b.createQueue(source, { deadLetter });
		await b.updateQueue(source, { deadLetter });
	}
}

let boss: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
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
			await createQueuesWithDeadLetters(b);
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
