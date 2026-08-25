/**
 * Batch extraction enqueueing tests — in-memory item store, no DB/pg-boss.
 * Covers: all open items enqueued, idempotent re-submits, worker-owned and
 * settled states untouched, dedup never treated as failure, failed retry.
 */
import { describe, it, expect, vi } from 'vitest';
import { enqueueBatchExtraction, type BatchEnqueueDeps } from '../src/lib/server/extract-batch';
import type { BatchItem, BatchItemStatus } from '../src/lib/server/batch';

function makeItem(id: string, position: number, status: BatchItemStatus): BatchItem {
	return {
		id,
		batchId: 'batch-1',
		restaurantId: 'rid-1',
		position,
		fileKey: `batch-1/${id}.pdf`,
		displayName: `${id}.pdf`,
		status,
		extractedData: null,
		conversionNotes: null,
		extractError: null,
		queuedAt: null,
	};
}

function makeDeps(items: BatchItem[]) {
	const store = new Map(items.map(i => [i.id, { ...i }]));
	const enqueue = vi.fn<BatchEnqueueDeps['enqueue']>().mockResolvedValue(true);
	const deps: BatchEnqueueDeps = {
		getItem: async (id) => store.get(id) ?? null,
		getBatchItems: async () => [...store.values()].sort((a, b) => a.position - b.position),
		markQueued: vi.fn(async (id: string) => {
			const item = store.get(id);
			if (!item || (item.status !== 'pending' && item.status !== 'failed')) return false;
			item.status = 'queued';
			item.extractError = null;
			return true;
		}),
		enqueue,
	};
	return { store, deps, enqueue };
}

describe('enqueueBatchExtraction', () => {
	it('queues and enqueues every pending item of the batch', async () => {
		const { store, deps, enqueue } = makeDeps([
			makeItem('a', 1, 'pending'),
			makeItem('b', 2, 'pending'),
			makeItem('c', 3, 'pending'),
		]);
		await enqueueBatchExtraction('a', 'rid-1', deps);

		expect(enqueue.mock.calls.map(c => c[0])).toEqual(['a', 'b', 'c']);
		for (const id of ['a', 'b', 'c']) {
			expect(store.get(id)?.status).toBe('queued');
		}
	});

	it('is idempotent: duplicate submit never clobbers worker-owned or settled states', async () => {
		const done = makeItem('a', 1, 'done');
		done.extractedData = { supplier_name: 'Proveedor Test' };
		const { store, deps, enqueue } = makeDeps([
			done,
			makeItem('b', 2, 'extracting'),
			makeItem('c', 3, 'queued'),
			makeItem('d', 4, 'confirmed'),
		]);

		await enqueueBatchExtraction('a', 'rid-1', deps);

		expect(store.get('a')?.status).toBe('done');
		expect(store.get('a')?.extractedData).toEqual({ supplier_name: 'Proveedor Test' });
		expect(store.get('b')?.status).toBe('extracting');
		expect(store.get('d')?.status).toBe('confirmed');
		// only the still-queued item is re-sent (singletonKey dedups server-side)
		expect(enqueue.mock.calls.map(c => c[0])).toEqual(['c']);
	});

	it('treats a deduped send as a no-op, not a failure', async () => {
		const { store, deps, enqueue } = makeDeps([makeItem('a', 1, 'pending')]);
		enqueue.mockResolvedValue(false); // pg-boss singleton dedup
		await enqueueBatchExtraction('a', 'rid-1', deps);

		expect(store.get('a')?.status).toBe('queued');
		expect(store.get('a')?.extractError).toBeNull();
	});

	it('re-queues failed items and clears the previous error (retry path)', async () => {
		const failed = makeItem('a', 1, 'failed');
		failed.extractError = 'extract.err.generic';
		const { store, deps, enqueue } = makeDeps([failed]);

		await enqueueBatchExtraction('a', 'rid-1', deps);

		expect(store.get('a')?.status).toBe('queued');
		expect(store.get('a')?.extractError).toBeNull();
		expect(enqueue).toHaveBeenCalledWith('a', 'rid-1');
	});

	it('does nothing when the entry item does not exist', async () => {
		const { deps, enqueue } = makeDeps([]);
		await enqueueBatchExtraction('ghost', 'rid-1', deps);
		expect(enqueue).not.toHaveBeenCalled();
	});
});
