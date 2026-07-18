/**
 * Batch upload data layer — the single owner of batch_items state.
 *
 * Every status transition is a guarded UPDATE (`WHERE status IN (…)`) that
 * reports whether it actually fired. Stale or duplicate requests therefore
 * become no-ops instead of lost updates; callers never read-modify-write.
 *
 * Ownership: the web process calls createBatch/addItems/markQueued/
 * markConfirmed/markDiscarded/removeItem; the worker calls markExtracting/
 * markDone/markFailed. Neither side writes the other's transitions.
 *
 * Factory over an injected drizzle instance so tests can run the real SQL
 * against the test database; `batch.ts` binds it to the app connection.
 */
import { and, asc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PostgresJsDatabase, PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { uploadBatches, batchItems } from './schema';

// Accepts a transaction too, so callers can run a guarded transition inside
// an enclosing db.transaction (e.g. invoice save + item confirm, issue #248).
export type BatchDb =
	| PostgresJsDatabase<typeof schema>
	| PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type BatchItemStatus =
	| 'pending' | 'queued' | 'extracting' | 'done' | 'failed' | 'confirmed' | 'discarded';

export interface BatchItem {
	id: string;
	batchId: string;
	restaurantId: string;
	position: number;
	fileKey: string;
	displayName: string;
	status: BatchItemStatus;
	extractedData: Record<string, unknown> | null;
	conversionNotes: string[] | null;
	extractError: string | null;
}

const itemColumns = {
	id: batchItems.id,
	batchId: batchItems.batchId,
	restaurantId: batchItems.restaurantId,
	position: batchItems.position,
	fileKey: batchItems.fileKey,
	displayName: batchItems.displayName,
	status: batchItems.status,
	extractedData: batchItems.extractedData,
	conversionNotes: batchItems.conversionNotes,
	extractError: batchItems.extractError,
};

function asItem(row: Record<string, unknown>): BatchItem {
	return row as unknown as BatchItem;
}

// Route params land here unvalidated; a non-UUID (e.g. a legacy session id
// from an old link) would make Postgres throw on the uuid cast (22P02).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
	return UUID_RE.test(v);
}

/**
 * The item a review UI should surface: the first reviewable (`done`) open
 * item, else the first failed one. Returns null while everything open is
 * still pending or in flight.
 */
export function pickActiveItem(items: BatchItem[]): BatchItem | null {
	const open = items.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
	return open.find(i => i.status === 'done') ?? open.find(i => i.status === 'failed') ?? null;
}

export function createBatchStore(db: BatchDb) {
	async function createBatch(
		restaurantId: string,
		files: Array<{ key: string; name: string }>,
	): Promise<{ batchId: string; itemIds: string[] }> {
		const [batch] = await db.insert(uploadBatches).values({ restaurantId }).returning({ id: uploadBatches.id });
		const rows = await db
			.insert(batchItems)
			.values(files.map((f, i) => ({
				batchId: batch.id,
				restaurantId,
				position: i + 1,
				fileKey: f.key,
				displayName: f.name,
			})))
			.returning({ id: batchItems.id, position: batchItems.position });
		rows.sort((a, b) => a.position - b.position);
		return { batchId: batch.id, itemIds: rows.map(r => r.id) };
	}

	/** Appends items to an existing batch, continuing the position sequence. */
	async function addItems(
		batchId: string,
		restaurantId: string,
		files: Array<{ key: string; name: string }>,
	): Promise<string[]> {
		const [{ max }] = await db
			.select({ max: sql<number>`coalesce(max(${batchItems.position}), 0)` })
			.from(batchItems)
			.where(eq(batchItems.batchId, batchId));
		const rows = await db
			.insert(batchItems)
			.values(files.map((f, i) => ({
				batchId,
				restaurantId,
				position: Number(max) + i + 1,
				fileKey: f.key,
				displayName: f.name,
			})))
			.returning({ id: batchItems.id });
		return rows.map(r => r.id);
	}

	async function getItem(itemId: string): Promise<BatchItem | null> {
		if (!isUuid(itemId)) return null;
		const rows = await db.select(itemColumns).from(batchItems).where(eq(batchItems.id, itemId)).limit(1);
		return rows.length ? asItem(rows[0]) : null;
	}

	/** All items of a batch in position order (including confirmed/discarded). */
	async function getBatchItems(batchId: string): Promise<BatchItem[]> {
		if (!isUuid(batchId)) return [];
		const rows = await db
			.select(itemColumns)
			.from(batchItems)
			.where(eq(batchItems.batchId, batchId))
			.orderBy(asc(batchItems.position));
		return rows.map(asItem);
	}

	/**
	 * The next item still needing user attention (anything not confirmed or
	 * discarded), preferring items after `afterPosition`, then wrapping around.
	 */
	async function nextReviewableItem(
		batchId: string,
		afterPosition = 0,
	): Promise<BatchItem | null> {
		const open = (await getBatchItems(batchId))
			.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
		return open.find(i => i.position > afterPosition) ?? open[0] ?? null;
	}

	/** Deletes an item outright — only allowed before extraction starts. */
	async function removeItem(itemId: string): Promise<BatchItem | null> {
		const rows = await db
			.delete(batchItems)
			.where(and(eq(batchItems.id, itemId), inArray(batchItems.status, ['pending', 'failed'])))
			.returning(itemColumns);
		return rows.length ? asItem(rows[0]) : null;
	}

	async function deleteBatch(batchId: string): Promise<void> {
		await db.delete(uploadBatches).where(eq(uploadBatches.id, batchId)); // items cascade
	}

	async function cleanupStaleBatches(): Promise<void> {
		const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
		await db.delete(uploadBatches).where(lt(uploadBatches.createdAt, cutoff));
	}

	// ── Guarded transitions ────────────────────────────────────────────────────

	async function transition(
		itemId: string,
		from: BatchItemStatus[],
		set: Partial<typeof batchItems.$inferInsert>,
	): Promise<boolean> {
		const rows = await db
			.update(batchItems)
			.set({ ...set, updatedAt: new Date() })
			.where(and(eq(batchItems.id, itemId), inArray(batchItems.status, from)))
			.returning({ id: batchItems.id });
		return rows.length > 0;
	}

	/** Web: pending/failed → queued (re-queueing a failed item is the retry path). */
	function markQueued(itemId: string): Promise<boolean> {
		return transition(itemId, ['pending', 'failed'], { status: 'queued', extractError: null });
	}

	/** Worker: queued → extracting. */
	function markExtracting(itemId: string): Promise<boolean> {
		return transition(itemId, ['queued'], { status: 'extracting' });
	}

	/** Worker: extracting (or queued, if the extracting write raced) → done. */
	function markDone(
		itemId: string,
		extractedData: Record<string, unknown>,
		conversionNotes: string[],
	): Promise<boolean> {
		return transition(itemId, ['extracting', 'queued'], {
			status: 'done',
			extractedData,
			conversionNotes,
			extractError: null,
		});
	}

	/** Worker: queued/extracting → failed. */
	function markFailed(itemId: string, extractError: string): Promise<boolean> {
		return transition(itemId, ['queued', 'extracting'], { status: 'failed', extractError });
	}

	/** Web: done → confirmed (the invoice was saved). */
	function markConfirmed(itemId: string): Promise<boolean> {
		return transition(itemId, ['done'], { status: 'confirmed' });
	}

	/** Web: any non-terminal state → discarded. */
	function markDiscarded(itemId: string): Promise<boolean> {
		return transition(
			itemId,
			['pending', 'queued', 'extracting', 'done', 'failed'],
			{ status: 'discarded' },
		);
	}

	/** True when no item in the batch still needs user attention. */
	async function isBatchSettled(batchId: string): Promise<boolean> {
		const rows = await db
			.select({ id: batchItems.id })
			.from(batchItems)
			.where(and(
				eq(batchItems.batchId, batchId),
				ne(batchItems.status, 'confirmed'),
				ne(batchItems.status, 'discarded'),
			))
			.limit(1);
		return rows.length === 0;
	}

	return {
		createBatch, addItems, getItem, getBatchItems, nextReviewableItem,
		removeItem, deleteBatch, cleanupStaleBatches,
		markQueued, markExtracting, markDone, markFailed, markConfirmed, markDiscarded,
		isBatchSettled,
	};
}
