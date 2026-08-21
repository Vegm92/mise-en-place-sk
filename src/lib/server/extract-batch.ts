import type { BatchItem } from './batch';

export interface BatchEnqueueDeps {
	getItem(itemId: string): Promise<BatchItem | null>;
	getBatchItems(batchId: string): Promise<BatchItem[]>;
	markQueued(itemId: string): Promise<boolean>;
	enqueue(itemId: string, restaurantId: string): Promise<boolean>;
}

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
