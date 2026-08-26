/**
 * pickActiveItem — which item the batch page's right panel shows.
 */
import { describe, it, expect } from 'vitest';
import { pickActiveItem, type BatchItem, type BatchItemStatus } from '../src/lib/server/batch';

function item(id: string, position: number, status: BatchItemStatus): BatchItem {
	return {
		id, position, status,
		batchId: 'b', restaurantId: 'r',
		fileKey: `b/${id}.pdf`, displayName: `${id}.pdf`,
		extractedData: null, conversionNotes: null, extractError: null, queuedAt: null,
	};
}

describe('pickActiveItem', () => {
	it('returns null while everything open is pending or in flight', () => {
		expect(pickActiveItem([item('a', 1, 'pending'), item('b', 2, 'queued'), item('c', 3, 'extracting')])).toBeNull();
	});

	it('prefers the first done item over later ones and over failed', () => {
		const items = [item('a', 1, 'failed'), item('b', 2, 'done'), item('c', 3, 'done')];
		expect(pickActiveItem(items)?.id).toBe('b');
	});

	it('falls back to the first failed item when nothing is done', () => {
		const items = [item('a', 1, 'extracting'), item('b', 2, 'failed')];
		expect(pickActiveItem(items)?.id).toBe('b');
	});

	it('ignores confirmed and discarded items', () => {
		const items = [item('a', 1, 'confirmed'), item('b', 2, 'discarded'), item('c', 3, 'done')];
		expect(pickActiveItem(items)?.id).toBe('c');
		expect(pickActiveItem([item('a', 1, 'confirmed'), item('b', 2, 'discarded')])).toBeNull();
	});
});
