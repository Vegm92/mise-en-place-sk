/**
 * pg-boss queue — web-process side (send-only).
 * Lazy singleton: starts once on first use.
 */
import { PgBoss } from 'pg-boss';

export const EXTRACTION_QUEUE = 'extract-invoice';

let boss: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
	if (boss) return boss;
	if (!startPromise) {
		startPromise = (async () => {
			const connectionString = process.env.DATABASE_URL;
			if (!connectionString) throw new Error('DATABASE_URL is required');
			const b = new PgBoss({
				connectionString,
				ssl: { rejectUnauthorized: false },
				max: 2,
			});
			await b.start();
			boss = b;
			return b;
		})();
	}
	return startPromise;
}

export async function enqueueExtraction(sessionId: string, restaurantId: string): Promise<void> {
	const b = await getBoss();
	await b.send(EXTRACTION_QUEUE, { sessionId, restaurantId }, {
		retryLimit: 2,
		retryDelay: 30,
		expireInSeconds: 600,
	});
}
