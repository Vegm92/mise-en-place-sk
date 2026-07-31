import { db } from './db';
import { createBatchStore } from './batch-core';

export type { BatchItem, BatchItemStatus } from './batch-core';
export { pickActiveItem } from './batch-core';

export const {
	createBatch, addItems, getItem, getBatchItems, nextReviewableItem,
	removeItem, deleteBatch, cleanupStaleBatches,
	markQueued, markExtracting, markDone, markFailed, markConfirmed, markDiscarded,
	isBatchSettled,
} = createBatchStore(db);
