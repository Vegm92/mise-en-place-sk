/**
 * Idempotency-key helper (issue #250). A generic layer on top of the DB
 * uniqueness fixes: money-adjacent form actions render a hidden per-submit
 * UUID and claim it here before mutating, turning any duplicate submit
 * (double-click, offline-queue replay, proxy retry) into a transparent no-op.
 *
 * Claim inside the mutation's transaction where one exists, so a rolled-back
 * save releases the key automatically. For a handled conflict that commits,
 * call releaseRequest in the same transaction to free the key so a corrected
 * resubmit isn't wrongly skipped.
 */
import { db } from './db';
import { processedRequests } from './schema';
import { eq, lt } from 'drizzle-orm';
import type { BatchDb } from './batch-core';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed UUID key — anything else is ignored (feature is best-effort). */
export function isValidKey(key: unknown): key is string {
	return typeof key === 'string' && UUID_RE.test(key);
}

/**
 * Atomically claims a request key. Returns true on the first claim, false when
 * the key was already claimed (a replay). Runs on the passed executor so it can
 * join an enclosing transaction.
 */
export async function claimRequest(key: string, rid: string | null, exec: BatchDb = db): Promise<boolean> {
	const rows = await exec.insert(processedRequests)
		.values({ key, restaurantId: rid })
		.onConflictDoNothing()
		.returning({ key: processedRequests.key });
	return rows.length > 0;
}

/** Releases a claimed key (e.g. a handled conflict that still commits). */
export async function releaseRequest(key: string, exec: BatchDb = db): Promise<void> {
	await exec.delete(processedRequests).where(eq(processedRequests.key, key));
}

/** Prunes claim rows older than 48h. Piggybacks on the stale-batch cleanup cadence. */
export async function cleanupProcessedRequests(): Promise<void> {
	const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
	await db.delete(processedRequests).where(lt(processedRequests.createdAt, cutoff));
}
