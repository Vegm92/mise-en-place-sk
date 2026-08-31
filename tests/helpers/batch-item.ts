/**
 * One BatchItem fixture for every suite that needs one.
 *
 * Fourteen test files each carried their own near-identical literal, so any
 * column added to BatchItem had to be added fourteen times and the shape was
 * flagged by the duplication gate. Override only what the test is about.
 */
import type { BatchItem } from '../../src/lib/server/batch';

export function fakeBatchItem(overrides: Partial<BatchItem> = {}): BatchItem {
	return {
		id: 'item-1',
		batchId: 'batch-1',
		restaurantId: 'rid-1',
		position: 0,
		fileKey: 'fake.pdf',
		displayName: 'fake.pdf',
		status: 'done',
		extractedData: null,
		conversionNotes: null,
		extractError: null,
		extractErrorVars: null,
		queuedAt: null,
		source: 'web',
		sourceRef: null,
		jobCode: null,
		reviewStatus: null,
		...overrides,
	};
}
