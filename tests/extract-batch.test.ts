/**
 * Batch extraction enqueueing tests — in-memory session store, no DB/pg-boss.
 * Covers issue #171: all chained sessions enqueued, idempotent re-submits,
 * worker-owned states untouched, dedup never marks a session failed.
 */
import { describe, it, expect, vi } from 'vitest';
import { collectBatchIds, enqueueBatchExtraction, type BatchDeps } from '../src/lib/server/extract-batch';
import type { Session } from '../src/lib/server/sessions';

function makeStore(sessions: Session[]) {
	const store = new Map(sessions.map(s => [s.id, structuredClone(s)]));
	const enqueue = vi.fn<BatchDeps['enqueue']>().mockResolvedValue(true);
	const deps: BatchDeps = {
		readSession: async (id) => store.get(id) ?? null,
		writeSession: async (s) => { store.set(s.id, structuredClone(s)); },
		enqueue,
	};
	return { store, deps, enqueue };
}

function chain(...specs: Array<Partial<Session> & { id: string }>): Session[] {
	return specs.map((spec, i) => ({
		files: [`invoice_${i}.pdf`],
		remaining: specs.slice(i + 1).map(s => s.id),
		...spec,
	}));
}

describe('collectBatchIds', () => {
	it('walks the full remaining chain in order', async () => {
		const { deps } = makeStore(chain({ id: 'a' }, { id: 'b' }, { id: 'c' }));
		expect(await collectBatchIds('a', deps.readSession)).toEqual(['a', 'b', 'c']);
	});

	it('stops at a missing session instead of throwing', async () => {
		const sessions = chain({ id: 'a' }, { id: 'b' });
		sessions[0].remaining = ['ghost'];
		const { deps } = makeStore(sessions);
		expect(await collectBatchIds('a', deps.readSession)).toEqual(['a']);
	});

	it('is cycle-safe on a corrupted chain', async () => {
		const sessions = chain({ id: 'a' }, { id: 'b' });
		sessions[1].remaining = ['a'];
		const { deps } = makeStore(sessions);
		expect(await collectBatchIds('a', deps.readSession)).toEqual(['a', 'b']);
	});
});

describe('enqueueBatchExtraction', () => {
	it('marks every session queued and enqueues one job per invoice', async () => {
		const { store, deps, enqueue } = makeStore(chain({ id: 'a' }, { id: 'b' }, { id: 'c' }));
		await enqueueBatchExtraction('a', 'rid-1', deps);

		expect(enqueue.mock.calls.map(c => c[0])).toEqual(['a', 'b', 'c']);
		for (const id of ['a', 'b', 'c']) {
			expect(store.get(id)?.extractionStatus).toBe('queued');
		}
	});

	it('is idempotent: a duplicate submit never clobbers worker-owned states', async () => {
		const sessions = chain({ id: 'a' }, { id: 'b' }, { id: 'c' });
		sessions[0].extractionStatus = 'done';
		sessions[0].extractedData = { supplier_name: 'Proveedor Test' };
		sessions[1].extractionStatus = 'extracting';
		sessions[2].extractionStatus = 'queued';
		const { store, deps, enqueue } = makeStore(sessions);

		await enqueueBatchExtraction('a', 'rid-1', deps);

		// done/extracting are untouched and not re-sent
		expect(store.get('a')?.extractionStatus).toBe('done');
		expect(store.get('a')?.extractedData).toEqual({ supplier_name: 'Proveedor Test' });
		expect(store.get('b')?.extractionStatus).toBe('extracting');
		// queued is re-sent (singletonKey dedups server-side) but not rewritten
		expect(enqueue.mock.calls.map(c => c[0])).toEqual(['c']);
	});

	it('never marks a session failed when the send is deduped', async () => {
		const { store, deps, enqueue } = makeStore(chain({ id: 'a' }));
		enqueue.mockResolvedValue(false); // pg-boss singleton dedup
		await enqueueBatchExtraction('a', 'rid-1', deps);

		expect(store.get('a')?.extractionStatus).toBe('queued');
		expect(store.get('a')?.extractError).toBeUndefined();
	});

	it('re-queues failed sessions and clears the previous error (retry path)', async () => {
		const sessions = chain({ id: 'a' });
		sessions[0].extractionStatus = 'failed';
		sessions[0].extractError = 'extract.err.generic';
		const { store, deps, enqueue } = makeStore(sessions);

		await enqueueBatchExtraction('a', 'rid-1', deps);

		expect(store.get('a')?.extractionStatus).toBe('queued');
		expect(store.get('a')?.extractError).toBeUndefined();
		expect(enqueue).toHaveBeenCalledWith('a', 'rid-1');
	});
});
