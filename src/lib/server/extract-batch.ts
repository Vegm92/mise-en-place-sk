/**
 * Batch extraction enqueueing — walks the upload-session chain and enqueues
 * one job per invoice, idempotently.
 *
 * Deps are injected (no module-level sessions/queue import) so this logic is
 * testable without a DB or pg-boss, mirroring the repo's pure-logic test style.
 */
import type { Session } from './sessions';

export interface BatchDeps {
	readSession(id: string): Promise<Session | null>;
	writeSession(session: Session): Promise<void>;
	enqueue(sessionId: string, restaurantId: string): Promise<boolean>;
}

/** Hard cap on chain length — guards against a corrupted/cyclic `remaining` chain. */
const MAX_CHAIN = 50;

/** Collects the session id chain starting at `startId` (cycle-safe). */
export async function collectBatchIds(
	startId: string,
	readSession: BatchDeps['readSession'],
): Promise<string[]> {
	const ids: string[] = [];
	const seen = new Set<string>();
	let cur: string | undefined = startId;
	while (cur && !seen.has(cur) && ids.length < MAX_CHAIN) {
		seen.add(cur);
		const session = await readSession(cur);
		if (!session) break;
		ids.push(cur);
		cur = session.remaining?.[0];
	}
	return ids;
}

/**
 * Marks every session in the batch as queued and sends one pg-boss job each.
 *
 * Idempotent: sessions already `extracting` or `done` are left untouched
 * (the worker owns those transitions), `queued` sessions are re-sent but the
 * pg-boss singletonKey dedups, and a deduped send is never treated as a
 * failure. `failed` sessions are re-queued, which makes retry-after-error work.
 */
export async function enqueueBatchExtraction(
	startId: string,
	restaurantId: string,
	deps: BatchDeps,
): Promise<void> {
	const ids = await collectBatchIds(startId, deps.readSession);
	for (const id of ids) {
		const session = await deps.readSession(id);
		if (!session) continue;

		const status = session.extractionStatus;
		if (status === 'done' || status === 'extracting') continue;

		if (status !== 'queued') {
			await deps.writeSession({ ...session, extractionStatus: 'queued', extractError: undefined });
		}
		await deps.enqueue(id, restaurantId);
	}
}
