import * as v from 'valibot';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { products } from './schema';
import { markQueued } from './batch';
import {
	ACCOUNT_CLEANUP_QUEUE,
	CATEGORIZE_QUEUE,
	EXTRACTION_QUEUE,
	NORMALIZE_QUEUE,
	WHATSAPP_INBOUND_QUEUE,
	WHATSAPP_NOTIFY_QUEUE,
	enqueueCategorize,
	enqueueExtraction,
	enqueueNormalize,
	enqueueWhatsAppNotify,
} from './queue';

export interface ReplayableEntry {
	queue: string;
	sourceId: string | null;
	restaurantId: string | null;
	payload: unknown;
}

export type ReplayFailure =
	| 'notReplayable'
	| 'itemNotRequeueable'
	| 'sourceMissing'
	| 'enqueueFailed';

export type ReplayResult = { ok: true } | { ok: false; error: ReplayFailure; status: number };

const ok: ReplayResult = { ok: true };
const no = (error: ReplayFailure, status: number): ReplayResult => ({ ok: false, error, status });

export const NON_REPLAYABLE_QUEUES: Record<string, string> = {
	[WHATSAPP_INBOUND_QUEUE]: 'admin.dlq.notReplayable.redacted',
	[ACCOUNT_CLEANUP_QUEUE]: 'admin.dlq.notReplayable.truncated',
};

const ProductJob = v.object({
	restaurantId: v.pipe(v.string(), v.uuid()),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

const NotifyJob = v.object({
	itemId: v.pipe(v.string(), v.uuid()),
	restaurantId: v.pipe(v.string(), v.uuid()),
});

async function productName(restaurantId: string, productId: number): Promise<string | null> {
	// tenant-scope-ok: admin-gated replay; the restaurantId is the one recorded on
	// the dead-letter row and is matched, not trusted from a request.
	const [row] = await db
		.select({ canonicalName: products.canonicalName, restaurantId: products.restaurantId })
		.from(products)
		.where(eq(products.id, productId))
		.limit(1);
	if (!row || row.restaurantId !== restaurantId) return null;
	return row.canonicalName;
}

type Replayer = (entry: ReplayableEntry, requestId?: string) => Promise<ReplayResult>;

const REPLAYERS: Record<string, Replayer> = {
	async [EXTRACTION_QUEUE](entry, requestId) {
		if (!entry.sourceId || !entry.restaurantId) return no('notReplayable', 400);
		if (!(await markQueued(entry.sourceId))) return no('itemNotRequeueable', 409);
		return (await enqueueExtraction(entry.sourceId, entry.restaurantId, requestId))
			? ok
			: no('enqueueFailed', 500);
	},

	async [NORMALIZE_QUEUE](entry, requestId) {
		const parsed = v.safeParse(ProductJob, entry.payload);
		if (!parsed.success) return no('notReplayable', 400);
		const { restaurantId, productId } = parsed.output;
		const name = await productName(restaurantId, productId);
		if (name === null) return no('sourceMissing', 409);
		return (await enqueueNormalize(restaurantId, productId, name, requestId))
			? ok
			: no('enqueueFailed', 500);
	},

	async [CATEGORIZE_QUEUE](entry, requestId) {
		const parsed = v.safeParse(ProductJob, entry.payload);
		if (!parsed.success) return no('notReplayable', 400);
		const { restaurantId, productId } = parsed.output;
		const name = await productName(restaurantId, productId);
		if (name === null) return no('sourceMissing', 409);
		return (await enqueueCategorize(restaurantId, productId, name, requestId))
			? ok
			: no('enqueueFailed', 500);
	},

	async [WHATSAPP_NOTIFY_QUEUE](entry, requestId) {
		const parsed = v.safeParse(NotifyJob, entry.payload);
		if (!parsed.success) return no('notReplayable', 400);
		return (await enqueueWhatsAppNotify(parsed.output.itemId, parsed.output.restaurantId, requestId))
			? ok
			: no('enqueueFailed', 500);
	},
};

export function isReplayable(entry: ReplayableEntry): boolean {
	if (!(entry.queue in REPLAYERS)) return false;
	if (entry.queue === EXTRACTION_QUEUE) return !!entry.sourceId && !!entry.restaurantId;
	return true;
}

export function nonReplayableReason(queue: string): string | null {
	return NON_REPLAYABLE_QUEUES[queue] ?? null;
}

export async function replayDeadLetter(
	entry: ReplayableEntry,
	requestId?: string,
): Promise<ReplayResult> {
	const replay = REPLAYERS[entry.queue];
	if (!replay) return no('notReplayable', 400);
	return replay(entry, requestId);
}
