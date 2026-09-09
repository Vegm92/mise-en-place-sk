import { PgBoss } from 'pg-boss';
import { pgSslConfig } from './db-ssl.js';
import type { WhatsAppInboundMessage } from './integrations/whatsapp/transport.js';

import {
	WHATSAPP_NOTIFY_QUEUE,
	WHATSAPP_INBOUND_QUEUE,
	WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE,
	WHATSAPP_INBOUND_DEAD_LETTER_QUEUE,
	WHATSAPP_NOTIFY_OPTIONS,
	WHATSAPP_INBOUND_OPTIONS,
} from './contracts/whatsapp-contract.js';

import {
	EXTRACTION_QUEUE,
	EXTRACTION_DEAD_LETTER_QUEUE,
	EXTRACTION_OPTIONS,
} from './contracts/extraction-contract.js';

import {
	NORMALIZE_QUEUE,
	NORMALIZE_DEAD_LETTER_QUEUE,
	CATEGORIZE_QUEUE,
	CATEGORIZE_DEAD_LETTER_QUEUE,
	NORMALIZE_OPTIONS,
	CATEGORIZE_OPTIONS,
} from './contracts/products-contract.js';

import {
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
	WHATSAPP_INBOUND_DEAD_LETTER_QUEUE,
	ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE,
};

export const DEAD_LETTER_QUEUES: Array<{ source: string; deadLetter: string }> = [
	{ source: EXTRACTION_QUEUE, deadLetter: EXTRACTION_DEAD_LETTER_QUEUE },
	{ source: NORMALIZE_QUEUE, deadLetter: NORMALIZE_DEAD_LETTER_QUEUE },
	{ source: CATEGORIZE_QUEUE, deadLetter: CATEGORIZE_DEAD_LETTER_QUEUE },
	{ source: WHATSAPP_NOTIFY_QUEUE, deadLetter: WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE },
	{ source: WHATSAPP_INBOUND_QUEUE, deadLetter: WHATSAPP_INBOUND_DEAD_LETTER_QUEUE },
	{ source: ACCOUNT_CLEANUP_QUEUE, deadLetter: ACCOUNT_CLEANUP_DEAD_LETTER_QUEUE },
];

export async function createQueuesWithDeadLetters(b: PgBoss): Promise<void> {
	for (const { source, deadLetter } of DEAD_LETTER_QUEUES) {
		await b.createQueue(deadLetter);
		await b.createQueue(source, { deadLetter });
		await b.updateQueue(source, { deadLetter });
	}
}

const DATABASE_URL = process.env.DATABASE_URL ?? '';
let boss: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
	if (boss) return boss;
	if (!startPromise) {
		startPromise = (async () => {
			const connectionString = DATABASE_URL;
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
	const jobId = await b.send(EXTRACTION_QUEUE, { itemId, restaurantId, requestId }, EXTRACTION_OPTIONS(itemId));
	return jobId !== null;
}

export async function enqueueNormalize(
	restaurantId: string,
	productId: number,
	rawText: string,
	requestId?: string,
): Promise<boolean> {
	const b = await getBoss();
	const jobId = await b.send(NORMALIZE_QUEUE, { restaurantId, productId, rawText, requestId }, NORMALIZE_OPTIONS(restaurantId, productId));
	return jobId !== null;
}

export async function enqueueCategorize(
	restaurantId: string,
	productId: number,
	canonicalName: string,
	requestId?: string,
): Promise<boolean> {
	const b = await getBoss();
	const jobId = await b.send(CATEGORIZE_QUEUE, { restaurantId, productId, canonicalName, requestId }, CATEGORIZE_OPTIONS(restaurantId, productId));
	return jobId !== null;
}

export async function enqueueWhatsAppNotify(
	itemId: string,
	restaurantId: string,
	requestId?: string,
): Promise<boolean> {
	const b = await getBoss();
	const jobId = await b.send(WHATSAPP_NOTIFY_QUEUE, { itemId, restaurantId, requestId }, WHATSAPP_NOTIFY_OPTIONS(itemId));
	return jobId !== null;
}

export interface WhatsAppInboundJobData {
	messageId: string;
	msg: WhatsAppInboundMessage;
	requestId?: string;
}

export async function enqueueWhatsAppInbound(msg: WhatsAppInboundMessage, requestId?: string): Promise<boolean> {
	const b = await getBoss();
	const jobId = await b.send(WHATSAPP_INBOUND_QUEUE, { messageId: msg.id, msg, requestId }, WHATSAPP_INBOUND_OPTIONS(msg.id));
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
	const jobId = await b.send(
		ACCOUNT_CLEANUP_QUEUE,
		{ itemId: userId, restaurantId, stripeSubscriptionIds, storageKeys, requestId },
		ACCOUNT_CLEANUP_OPTIONS(userId),
	);
	return jobId !== null;
}
