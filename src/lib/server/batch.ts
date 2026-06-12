/**
 * Batch data layer bound to the app DB connection.
 * Implementation lives in batch-core.ts (DI factory) so the guarded SQL is
 * testable against the test database; this module is the production binding.
 */
import { db } from './db';
import { createBatchStore } from './batch-core';

export type { BatchItem, BatchItemStatus } from './batch-core';

export const {
	createBatch, addItems, getItem, getBatchItems, nextReviewableItem,
	removeItem, deleteBatch, cleanupStaleBatches,
	markQueued, markExtracting, markDone, markFailed, markConfirmed, markDiscarded,
	isBatchSettled,
} = createBatchStore(db);
