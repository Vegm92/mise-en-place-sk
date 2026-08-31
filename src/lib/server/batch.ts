import { and, asc, eq, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PostgresJsDatabase, PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { uploadBatches, batchItems } from './schema';
import { getStorage } from './storage';
import { forTenant } from './tenant';
import { db } from './db';
import { EXTRACTION_STALL_TIMEOUT_MS, EXTRACTION_STALL_WARN_MS } from './env';
import { archiveBatchExtractions, pruneExtractionCorpus } from './extraction-corpus';

export interface BatchFileStorage {
	delete(key: string): Promise<void>;
}

export type BatchDb =
	| PostgresJsDatabase<typeof schema>
	| PostgresJsTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type BatchItemStatus =
	| 'pending' | 'queued' | 'extracting' | 'done' | 'failed' | 'confirmed' | 'discarded';

export type BatchItemSource = 'web' | 'whatsapp';

export type BatchItemReviewStatus = 'pending' | 'reviewed' | 'to_review';

export interface BatchItemOrigin {
	source?: BatchItemSource;
	sourceRef?: string | null;
	jobCode?: string | null;
}

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
	extractErrorVars: Record<string, string | number> | null;
	queuedAt: Date | null;
	source: BatchItemSource;
	sourceRef: string | null;
	jobCode: string | null;
	reviewStatus: BatchItemReviewStatus | null;
}

const REFUNDABLE_ON_CANCEL: readonly BatchItemStatus[] = ['pending', 'queued', 'failed'];

export function isRefundableOnCancel(status: BatchItemStatus): boolean {
	return REFUNDABLE_ON_CANCEL.includes(status);
}

export const STALL_ERROR = 'extract.err.stalled';

export type StallLevel = 'none' | 'slow' | 'expired';

const IN_FLIGHT: BatchItemStatus[] = ['queued', 'extracting'];

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
	extractErrorVars: batchItems.extractErrorVars,
	queuedAt: batchItems.queuedAt,
	source: batchItems.source,
	sourceRef: batchItems.sourceRef,
	jobCode: batchItems.jobCode,
	reviewStatus: batchItems.reviewStatus,
};

function asItem(row: Record<string, unknown>): BatchItem {
	return row as unknown as BatchItem;
}

function originColumns(origin: BatchItemOrigin): { source: BatchItemSource; sourceRef: string | null } {
	return { source: origin.source ?? 'web', sourceRef: origin.sourceRef ?? null };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
	return UUID_RE.test(v);
}

export function stallLevel(item: BatchItem, now = Date.now()): StallLevel {
	if (item.status !== 'queued' && item.status !== 'extracting') return 'none';
	if (!item.queuedAt) return 'none';
	const waited = now - new Date(item.queuedAt).getTime();
	if (waited >= EXTRACTION_STALL_TIMEOUT_MS) return 'expired';
	if (waited >= EXTRACTION_STALL_WARN_MS) return 'slow';
	return 'none';
}

export function pickStalledItem(items: BatchItem[], now = Date.now()): BatchItem | null {
	const stalled = items
		.filter(i => stallLevel(i, now) !== 'none')
		.sort((a, b) => new Date(a.queuedAt!).getTime() - new Date(b.queuedAt!).getTime());
	return stalled[0] ?? null;
}

export function pickActiveItem(items: BatchItem[], requestedId?: string | null): BatchItem | null {
	const open = items.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
	if (requestedId) {
		const requested = open.find(i => i.id === requestedId && (i.status === 'done' || i.status === 'failed'));
		if (requested) return requested;
	}
	return open.find(i => i.status === 'done') ?? open.find(i => i.status === 'failed') ?? null;
}

export function createBatchStore(db: BatchDb) {
	async function createBatch(
		restaurantId: string,
		files: Array<{ key: string; name: string }>,
		origin: BatchItemOrigin = {},
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
				...originColumns(origin),
				jobCode: i === 0 ? origin.jobCode ?? null : null,
			})))
			.returning({ id: batchItems.id, position: batchItems.position });
		rows.sort((a, b) => a.position - b.position);
		return { batchId: batch.id, itemIds: rows.map(r => r.id) };
	}

	async function addItems(
		batchId: string,
		restaurantId: string,
		files: Array<{ key: string; name: string }>,
		origin: BatchItemOrigin = {},
	): Promise<string[]> {
		// tenant-scope-ok: internal store keyed by batchId; the caller owns the
		// batch and passes restaurantId, which is written on every inserted row.
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
				...originColumns(origin),
			})))
			.returning({ id: batchItems.id });
		return rows.map(r => r.id);
	}

	async function getItem(itemId: string): Promise<BatchItem | null> {
		if (!isUuid(itemId)) return null;
		// tenant-scope-ok: returns restaurantId on the item so callers can check
		// ownership; every caller compares it against locals.restaurantId.
		const rows = await db.select(itemColumns).from(batchItems).where(eq(batchItems.id, itemId)).limit(1);
		return rows.length ? asItem(rows[0]) : null;
	}

	async function getBatchItems(batchId: string): Promise<BatchItem[]> {
		if (!isUuid(batchId)) return [];
		// tenant-scope-ok: returns restaurantId on each item so callers can check
		// ownership; /batch/[id] rejects the batch when any item is another tenant's.
		const rows = await db
			.select(itemColumns)
			.from(batchItems)
			.where(eq(batchItems.batchId, batchId))
			.orderBy(asc(batchItems.position));
		return rows.map(asItem);
	}

	async function nextReviewableItem(
		batchId: string,
		afterPosition = 0,
	): Promise<BatchItem | null> {
		const open = (await getBatchItems(batchId))
			.filter(i => i.status !== 'confirmed' && i.status !== 'discarded');
		return open.find(i => i.position > afterPosition) ?? open[0] ?? null;
	}

	async function removeItem(itemId: string, restaurantId: string): Promise<BatchItem | null> {
		const tdb = forTenant(restaurantId);
		const rows = await db
			.delete(batchItems)
			.where(tdb.scope(
				batchItems.restaurantId,
				and(eq(batchItems.id, itemId), inArray(batchItems.status, ['pending', 'failed'])),
			))
			.returning(itemColumns);
		return rows.length ? asItem(rows[0]) : null;
	}

	async function deleteBatch(batchId: string, restaurantId: string): Promise<void> {
		const tdb = forTenant(restaurantId);
		await db.delete(uploadBatches)
			.where(tdb.scope(uploadBatches.restaurantId, eq(uploadBatches.id, batchId)));
	}

	async function cleanupStaleBatches(
		storage: BatchFileStorage = getStorage(),
	): Promise<{ batchesDeleted: number; filesDeleted: number; fileErrors: number; extractionsArchived: number; corpusPruned: number }> {
		const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

		const extractionsArchived = await archiveBatchExtractions(db);

		// tenant-scope-ok: scheduled retention job, deliberately cross-tenant —
		// deletes stale batches for every restaurant by age, not by owner.
		const stale = await db
			.select({ fileKey: batchItems.fileKey })
			.from(batchItems)
			.innerJoin(uploadBatches, eq(batchItems.batchId, uploadBatches.id))
			.where(and(lt(uploadBatches.createdAt, cutoff), ne(batchItems.status, 'confirmed')));

		let filesDeleted = 0;
		let fileErrors = 0;
		for (const { fileKey } of stale) {
			try {
				await storage.delete(fileKey);
				filesDeleted++;
			} catch (err) {
				fileErrors++;
				console.error(`[batch] stale file delete failed for ${fileKey} (continuing):`, err);
			}
		}

		const deleted = await db
			.delete(uploadBatches)
			.where(lt(uploadBatches.createdAt, cutoff))
			.returning({ id: uploadBatches.id });

		const corpusPruned = await pruneExtractionCorpus(db);

		return { batchesDeleted: deleted.length, filesDeleted, fileErrors, extractionsArchived, corpusPruned };
	}

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

	function markQueued(itemId: string): Promise<boolean> {
		return transition(itemId, ['pending', 'failed'], {
			status: 'queued',
			extractError: null,
			extractErrorVars: null,
			queuedAt: new Date(),
		});
	}

	async function requeueStalled(itemId: string): Promise<boolean> {
		if (!(await transition(itemId, IN_FLIGHT, { status: 'failed', extractError: STALL_ERROR, extractErrorVars: null }))) {
			return false;
		}
		return markQueued(itemId);
	}

	async function failStalledItems(batchId: string, now = Date.now()): Promise<number> {
		if (!isUuid(batchId)) return 0;
		const cutoff = new Date(now - EXTRACTION_STALL_TIMEOUT_MS);
		// tenant-scope-ok: hard-timeout reaper for one batch the caller already
		// owns; keyed by batchId and by age, and it writes only the two columns
		// the worker would have written itself.
		const rows = await db
			.update(batchItems)
			.set({ status: 'failed', extractError: STALL_ERROR, updatedAt: new Date() })
			.where(and(
				eq(batchItems.batchId, batchId),
				inArray(batchItems.status, IN_FLIGHT),
				isNotNull(batchItems.queuedAt),
				lt(batchItems.queuedAt, cutoff),
			))
			.returning({ id: batchItems.id });
		if (rows.length) {
			console.warn(`[batch] ${rows.length} item(s) in batch ${batchId} timed out waiting for the worker`);
		}
		return rows.length;
	}

	function markExtracting(itemId: string): Promise<boolean> {
		return transition(itemId, ['queued', 'extracting'], { status: 'extracting' });
	}

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
			extractErrorVars: null,
		});
	}

	function markFailed(
		itemId: string,
		extractError: string,
		extractErrorVars?: Record<string, string | number>,
	): Promise<boolean> {
		return transition(itemId, ['queued', 'extracting'], {
			status: 'failed',
			extractError,
			extractErrorVars: extractErrorVars ?? null,
		});
	}

	function markConfirmed(itemId: string): Promise<boolean> {
		return transition(itemId, ['done'], { status: 'confirmed' });
	}

	function markDiscarded(itemId: string): Promise<boolean> {
		return transition(
			itemId,
			['pending', 'queued', 'extracting', 'done', 'failed'],
			{ status: 'discarded' },
		);
	}

	async function isBatchSettled(batchId: string): Promise<boolean> {
		// tenant-scope-ok: existence check on a batch the caller already owns;
		// returns only a boolean, no row data.
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
		requeueStalled, failStalledItems, isBatchSettled,
	};
}

export const {
	createBatch, addItems, getItem, getBatchItems, nextReviewableItem,
	removeItem, deleteBatch, cleanupStaleBatches,
	markQueued, markExtracting, markDone, markFailed, markConfirmed, markDiscarded,
	requeueStalled, failStalledItems, isBatchSettled,
} = createBatchStore(db);
