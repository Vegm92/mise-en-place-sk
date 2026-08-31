import type { BatchItem } from '../../src/lib/server/batch';

export function fakeBatchItem(restaurantId: string, extractedData: Record<string, unknown> | null): BatchItem {
	return {
		id: 'item-1',
		batchId: 'batch-1',
		restaurantId,
		position: 0,
		fileKey: 'fake.pdf',
		displayName: 'fake.pdf',
		status: 'done',
		extractedData,
		conversionNotes: null,
		extractError: null,
		queuedAt: null,
		source: 'web',
		sourceRef: null,
		jobCode: null,
		reviewStatus: null,
	};
}
