import { PgBoss } from 'pg-boss';
import { pgSslConfig } from './db-ssl';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

export const EXTRACTION_QUEUE = 'extract-invoice';
export const NORMALIZE_QUEUE = 'normalize-product';
export const WHATSAPP_NOTIFY_QUEUE = 'whatsapp-notify';

export const EXTRACTION_DEAD_LETTER_QUEUE = `${EXTRACTION_QUEUE}-dead-letter`;
export const NORMALIZE_DEAD_LETTER_QUEUE = `${NORMALIZE_QUEUE}-dead-letter`;
export const WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE = `${WHATSAPP_NOTIFY_QUEUE}-dead-letter`;

export const DEAD_LETTER_QUEUES: Array<{ source: string; deadLetter: string }> = [
	{ source: EXTRACTION_QUEUE, deadLetter: EXTRACTION_DEAD_LETTER_QUEUE },
	{ source: NORMALIZE_QUEUE, deadLetter: NORMALIZE_DEAD_LETTER_QUEUE },
	{ source: WHATSAPP_NOTIFY_QUEUE, deadLetter: WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE },
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
): Promise<boolean> {
	const b = await getBoss();
	const jobId = await b.send(EXTRACTION_QUEUE, { itemId, restaurantId }, {
		retryLimit: 2,
		retryDelay: 30,
		expireInSeconds: 600,
		singletonKey: itemId,
		deadLetter: EXTRACTION_DEAD_LETTER_QUEUE,
	});
	return jobId !== null;
}

export async function enqueueNormalize(
	restaurantId: string,
	productId: number,
	rawText: string,
): Promise<boolean> {
	const b = await getBoss();
	const jobId = await b.send(NORMALIZE_QUEUE, { restaurantId, productId, rawText }, {
		priority: -10,
		retryLimit: 1,
		retryDelay: 60,
		expireInSeconds: 900,
		singletonKey: `${restaurantId}:${productId}`,
		deadLetter: NORMALIZE_DEAD_LETTER_QUEUE,
	});
	return jobId !== null;
}

export async function enqueueWhatsAppNotify(
	itemId: string,
	restaurantId: string,
): Promise<boolean> {
	const b = await getBoss();
	const jobId = await b.send(WHATSAPP_NOTIFY_QUEUE, { itemId, restaurantId }, {
		retryLimit: 3,
		retryDelay: 60,
		expireInSeconds: 300,
		singletonKey: itemId,
		deadLetter: WHATSAPP_NOTIFY_DEAD_LETTER_QUEUE,
	});
	return jobId !== null;
}
