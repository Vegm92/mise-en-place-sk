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
			// pg-boss v10+ no longer auto-creates queues; send() requires the
			// queue to exist first. createQueue is idempotent.
			await b.createQueue(EXTRACTION_QUEUE);
			boss = b;
			return b;
		})();
	}
	return startPromise;
}

// Returns true if the job was enqueued, false if a job for the same session
// is already pending/active (pg-boss singletonKey dedup). A deduped send is
// expected on duplicate submits and must never be treated as a failure.
export async function enqueueExtraction(
	sessionId: string,
	restaurantId: string,
): Promise<boolean> {
	const b = await getBoss();
	const jobId = await b.send(EXTRACTION_QUEUE, { sessionId, restaurantId }, {
		retryLimit: 2,
		retryDelay: 30,
		expireInSeconds: 600,
		singletonKey: sessionId,
	});
	return jobId !== null;
}
