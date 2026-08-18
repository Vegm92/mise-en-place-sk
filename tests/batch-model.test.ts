/**
 * batch_items data layer — runs the real guarded-transition SQL against the
 * test database (skipped without DB env, like the other DB suites).
 *
 * The invariant under test: a transition only fires from its expected source
 * states, so a stale or duplicate request can never clobber another process's
 * write — the lost-update class of bugs from the JSON-blob sessions is gone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { createBatchStore } from '../src/lib/server/batch-core';

let rid = '';
const store = hasDbEnv ? createBatchStore(testDb) : null!;

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('batch')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid); // batches/items cascade
	await closeDb();
});

function twoFiles() {
	return [
		{ key: 'ns/a.pdf', name: 'a.pdf' },
		{ key: 'ns/b.pdf', name: 'b.pdf' },
	];
}

describe.skipIf(!hasDbEnv)('batch creation and reads', () => {
	it('creates one batch with positioned items and reads them back in order', async () => {
		const { batchId, itemIds } = await store.createBatch(rid, twoFiles());
		expect(itemIds).toHaveLength(2);

		const items = await store.getBatchItems(batchId);
		expect(items.map(i => i.position)).toEqual([1, 2]);
		expect(items.map(i => i.status)).toEqual(['pending', 'pending']);
		expect(items[0].fileKey).toBe('ns/a.pdf');
		expect(items[0].restaurantId).toBe(rid);
	});

	it('addItems continues the position sequence', async () => {
		const { batchId } = await store.createBatch(rid, twoFiles());
		await store.addItems(batchId, rid, [{ key: 'ns/c.pdf', name: 'c.pdf' }]);
		const items = await store.getBatchItems(batchId);
		expect(items.map(i => i.position)).toEqual([1, 2, 3]);
	});
});

describe.skipIf(!hasDbEnv)('guarded status transitions', () => {
	it('walks the happy path: pending → queued → extracting → done → confirmed', async () => {
		const { itemIds: [id] } = await store.createBatch(rid, twoFiles().slice(0, 1));

		expect(await store.markQueued(id)).toBe(true);
		expect(await store.markExtracting(id)).toBe(true);
		expect(await store.markDone(id, { supplier_name: 'Test SL' }, ['nota'])).toBe(true);
		expect(await store.markConfirmed(id)).toBe(true);

		const item = await store.getItem(id);
		expect(item?.status).toBe('confirmed');
		expect(item?.extractedData).toEqual({ supplier_name: 'Test SL' });
		expect(item?.conversionNotes).toEqual(['nota']);
	});

	it('transitions from a wrong source state affect 0 rows and report false', async () => {
		const { itemIds: [id] } = await store.createBatch(rid, twoFiles().slice(0, 1));

		// pending: worker transitions must all no-op
		expect(await store.markExtracting(id)).toBe(false);
		expect(await store.markDone(id, {}, [])).toBe(false);
		expect(await store.markFailed(id, 'x')).toBe(false);
		expect(await store.markConfirmed(id)).toBe(false);
		expect((await store.getItem(id))?.status).toBe('pending');
	});

	it('a stale duplicate request cannot clobber a done item (the old lost-update bug)', async () => {
		const { itemIds: [id] } = await store.createBatch(rid, twoFiles().slice(0, 1));
		await store.markQueued(id);
		await store.markExtracting(id);
		await store.markDone(id, { total_amount: 42 }, []);

		// duplicate extract submit tries to re-queue; duplicate worker tries to re-claim
		expect(await store.markQueued(id)).toBe(false);
		expect(await store.markExtracting(id)).toBe(false);

		const item = await store.getItem(id);
		expect(item?.status).toBe('done');
		expect(item?.extractedData).toEqual({ total_amount: 42 });
	});

	it('failed → queued retry clears the error', async () => {
		const { itemIds: [id] } = await store.createBatch(rid, twoFiles().slice(0, 1));
		await store.markQueued(id);
		await store.markFailed(id, 'extract.err.generic');

		expect(await store.markQueued(id)).toBe(true);
		const item = await store.getItem(id);
		expect(item?.status).toBe('queued');
		expect(item?.extractError).toBeNull();
	});

	it('discard wins over a late worker claim', async () => {
		const { itemIds: [id] } = await store.createBatch(rid, twoFiles().slice(0, 1));
		await store.markQueued(id);
		expect(await store.markDiscarded(id)).toBe(true);

		// worker job arrives after the user discarded — must not resurrect the item
		expect(await store.markExtracting(id)).toBe(false);
		expect(await store.markDone(id, {}, [])).toBe(false);
		expect((await store.getItem(id))?.status).toBe('discarded');
	});
});

describe.skipIf(!hasDbEnv)('batch lifecycle helpers', () => {
	it('removeItem only deletes pending/failed items', async () => {
		const { itemIds } = await store.createBatch(rid, twoFiles());
		await store.markQueued(itemIds[0]);

		expect(await store.removeItem(itemIds[0], rid)).toBeNull(); // queued → protected
		const removed = await store.removeItem(itemIds[1], rid);     // pending → removable
		expect(removed?.fileKey).toBe('ns/b.pdf');
	});

	it('removeItem and deleteBatch refuse a foreign restaurantId (issue #480)', async () => {
		const { batchId, itemIds } = await store.createBatch(rid, twoFiles());
		const otherRid = crypto.randomUUID();

		expect(await store.removeItem(itemIds[1], otherRid)).toBeNull();
		expect(await store.getItem(itemIds[1])).not.toBeNull();

		await store.deleteBatch(batchId, otherRid);
		expect(await store.getItem(itemIds[0])).not.toBeNull();
	});

	it('nextReviewableItem skips settled items and wraps around', async () => {
		const { batchId, itemIds } = await store.createBatch(rid, twoFiles());
		await store.markQueued(itemIds[0]);
		await store.markExtracting(itemIds[0]);
		await store.markDone(itemIds[0], {}, []);
		await store.markConfirmed(itemIds[0]);

		const next = await store.nextReviewableItem(batchId, 1);
		expect(next?.id).toBe(itemIds[1]);

		// after position 2 there is nothing → wraps to the open item
		const wrapped = await store.nextReviewableItem(batchId, 2);
		expect(wrapped?.id).toBe(itemIds[1]);
	});

	it('isBatchSettled is true only when every item is confirmed or discarded', async () => {
		const { batchId, itemIds } = await store.createBatch(rid, twoFiles());
		expect(await store.isBatchSettled(batchId)).toBe(false);

		await store.markQueued(itemIds[0]);
		await store.markExtracting(itemIds[0]);
		await store.markDone(itemIds[0], {}, []);
		await store.markConfirmed(itemIds[0]);
		await store.markDiscarded(itemIds[1]);

		expect(await store.isBatchSettled(batchId)).toBe(true);
	});

	it('deleteBatch cascades to items', async () => {
		const { batchId, itemIds } = await store.createBatch(rid, twoFiles());
		await store.deleteBatch(batchId, rid);
		expect(await store.getItem(itemIds[0])).toBeNull();
		expect(await store.getBatchItems(batchId)).toEqual([]);
	});
});

function fakeStorage(shouldFail: (key: string) => boolean = () => false) {
	const deletedKeys: string[] = [];
	return {
		deletedKeys,
		delete: async (key: string) => {
			if (shouldFail(key)) throw new Error(`boom: ${key}`);
			deletedKeys.push(key);
		},
	};
}

async function backdateBatch(batchId: string, hoursAgo: number) {
	await testSql`UPDATE upload_batches SET created_at = now() - ${`${hoursAgo} hours`}::interval WHERE id = ${batchId}`;
}

describe.skipIf(!hasDbEnv)('cleanupStaleBatches (#427)', () => {
	it('leaves batches younger than the 24h cutoff untouched', async () => {
		const { batchId } = await store.createBatch(rid, [
			{ key: 'ns/fresh-a.pdf', name: 'a.pdf' },
			{ key: 'ns/fresh-b.pdf', name: 'b.pdf' },
		]);
		const storage = fakeStorage();

		await store.cleanupStaleBatches(storage);

		expect(storage.deletedKeys).not.toContain('ns/fresh-a.pdf');
		expect(storage.deletedKeys).not.toContain('ns/fresh-b.pdf');
		expect(await store.getBatchItems(batchId)).toHaveLength(2);
	});

	it('deletes storage objects for stale non-confirmed items, preserves confirmed items\' files, and removes the batch row', async () => {
		const { batchId, itemIds } = await store.createBatch(rid, twoFiles());
		await store.markQueued(itemIds[0]);
		await store.markExtracting(itemIds[0]);
		await store.markDone(itemIds[0], {}, []);
		await store.markConfirmed(itemIds[0]); // ns/a.pdf is now owned by an invoice
		// itemIds[1] (ns/b.pdf) stays pending — an abandoned upload
		await backdateBatch(batchId, 25);

		const storage = fakeStorage();
		const result = await store.cleanupStaleBatches(storage);

		expect(result.batchesDeleted).toBeGreaterThanOrEqual(1);
		expect(storage.deletedKeys).toContain('ns/b.pdf');
		expect(storage.deletedKeys).not.toContain('ns/a.pdf');
		expect(await store.getBatchItems(batchId)).toEqual([]);
	});

	it('a storage delete failure is swallowed, counted, and does not block the sweep', async () => {
		const { batchId } = await store.createBatch(rid, [
			{ key: 'ns/err-a.pdf', name: 'a.pdf' },
			{ key: 'ns/err-b.pdf', name: 'b.pdf' },
		]);
		await backdateBatch(batchId, 25);

		const storage = fakeStorage(key => key === 'ns/err-a.pdf');
		const result = await store.cleanupStaleBatches(storage);

		expect(result.fileErrors).toBeGreaterThanOrEqual(1);
		expect(storage.deletedKeys).toContain('ns/err-b.pdf');
		expect(storage.deletedKeys).not.toContain('ns/err-a.pdf');
		expect(result.batchesDeleted).toBeGreaterThanOrEqual(1);
		expect(await store.getBatchItems(batchId)).toEqual([]);
	});
});
