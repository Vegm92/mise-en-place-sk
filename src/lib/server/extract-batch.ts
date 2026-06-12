/**
 * Batch extraction enqueueing — marks every open item of a batch queued and
 * sends one pg-boss job each, idempotently.
 *
 * Deps are injected (no module-level db/pg-boss import) so this logic is
 * testable without infrastructure, mirroring the repo's pure-logic test style.
 */
import type { BatchItem } from './batch-core';

export interface BatchEnqueueDeps {
	getItem(itemId: string): Promise<BatchItem | null>;
	getBatchItems(batchId: string): Promise<BatchItem[]>;
	/** Guarded pending/failed → queued; false when the item was not in those states. */
	markQueued(itemId: string): Promise<boolean>;
	enqueue(itemId: string, restaurantId: string): Promise<boolean>;
}

/**
 * Idempotent: items the worker already owns (extracting) or that are settled
 * (done/confirmed/discarded) are left untouched. `queued` items are re-sent —
 * the pg-boss singletonKey dedups — and a deduped send is never an error.
 * `failed` items re-queue, which is the retry path.
 */
export async function enqueueBatchExtraction(
	itemId: string,
	restaurantId: string,
	deps: BatchEnqueueDeps,
): Promise<void> {
	const item = await deps.getItem(itemId);
	if (!item) return;

	const items = await deps.getBatchItems(item.batchId);
	for (const it of items) {
		if (it.status === 'pending' || it.status === 'failed') {
			await deps.markQueued(it.id);
			await deps.enqueue(it.id, restaurantId);
		} else if (it.status === 'queued') {
			await deps.enqueue(it.id, restaurantId);
		}
	}
}
