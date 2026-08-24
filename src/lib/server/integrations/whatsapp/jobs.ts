import { randomInt } from 'node:crypto';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../../db';
import { batchItems } from '../../schema';
import { CODE_ALPHABET } from '../../whatsapp-pairing';
import { APP_BASE_URL } from '../../env';
import type { BatchItem, BatchItemReviewStatus } from '../../batch';

const JOB_CODE_LENGTH = 4;
const JOB_CODE_ATTEMPTS = 5;

const jobColumns = {
	id: batchItems.id,
	batchId: batchItems.batchId,
	restaurantId: batchItems.restaurantId,
	jobCode: batchItems.jobCode,
	status: batchItems.status,
	reviewStatus: batchItems.reviewStatus,
	extractedData: batchItems.extractedData,
	displayName: batchItems.displayName,
};

export type WhatsAppJob = {
	id: string;
	batchId: string;
	restaurantId: string;
	jobCode: string | null;
	status: BatchItem['status'];
	reviewStatus: BatchItemReviewStatus | null;
	extractedData: Record<string, unknown> | null;
	displayName: string;
};

export function randomJobCode(): string {
	let out = '';
	for (let i = 0; i < JOB_CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return out;
}

export function normalizeJobCode(input: string): string | null {
	const cleaned = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (cleaned.length !== JOB_CODE_LENGTH) return null;
	for (const ch of cleaned) if (!CODE_ALPHABET.includes(ch)) return null;
	return cleaned;
}

const openJob = () => or(isNull(batchItems.reviewStatus), eq(batchItems.reviewStatus, 'pending'));

export async function generateJobCode(): Promise<string> {
	for (let attempt = 0; attempt < JOB_CODE_ATTEMPTS; attempt++) {
		const code = randomJobCode();
		// tenant-scope-ok: job codes are unique across open jobs globally, not
		// per tenant — the unique index they back is global, so the collision
		// check has to be too. Returns only a boolean.
		const taken = await db
			.select({ id: batchItems.id })
			.from(batchItems)
			.where(and(eq(batchItems.jobCode, code), openJob()))
			.limit(1);
		if (taken.length === 0) return code;
	}
	throw new Error('[whatsapp-jobs] could not allocate a free job code');
}

export async function findJobByCode(phone: string, code: string): Promise<WhatsAppJob | null> {
	const normalized = normalizeJobCode(code);
	if (!normalized) return null;
	// tenant-scope-ok: keyed on source_ref, the sender's own number, which is
	// what resolved the tenant in the first place — a sender can only ever
	// reach the jobs they themselves sent.
	const rows = await db
		.select(jobColumns)
		.from(batchItems)
		.where(and(
			eq(batchItems.jobCode, normalized),
			eq(batchItems.source, 'whatsapp'),
			eq(batchItems.sourceRef, phone),
			openJob(),
		))
		.limit(1);
	return rows.length ? (rows[0] as WhatsAppJob) : null;
}

export async function pendingJobsFor(phone: string): Promise<WhatsAppJob[]> {
	// tenant-scope-ok: keyed on source_ref, the sender's own number — see
	// findJobByCode above.
	const rows = await db
		.select(jobColumns)
		.from(batchItems)
		.where(and(
			eq(batchItems.source, 'whatsapp'),
			eq(batchItems.sourceRef, phone),
			eq(batchItems.reviewStatus, 'pending'),
			eq(batchItems.status, 'done'),
		))
		.orderBy(asc(batchItems.createdAt));
	return rows as WhatsAppJob[];
}

export async function setReviewStatus(
	itemId: string,
	next: BatchItemReviewStatus,
	from: Array<BatchItemReviewStatus | null>,
): Promise<boolean> {
	const fromValues = from.filter((v): v is BatchItemReviewStatus => v !== null);
	const previous = from.includes(null)
		? fromValues.length
			? or(isNull(batchItems.reviewStatus), inArray(batchItems.reviewStatus, fromValues))
			: isNull(batchItems.reviewStatus)
		: inArray(batchItems.reviewStatus, fromValues);

	// tenant-scope-ok: keyed on the item UUID the caller already resolved from
	// the sender's own source_ref (findJobByCode / pendingJobsFor), the same
	// justification the guarded transitions in batch.ts carry.
	const rows = await db
		.update(batchItems)
		.set({ reviewStatus: next, updatedAt: new Date() })
		.where(and(eq(batchItems.id, itemId), eq(batchItems.source, 'whatsapp'), previous))
		.returning({ id: batchItems.id });
	return rows.length > 0;
}

export function batchLink(batchId: string): string {
	return APP_BASE_URL ? `${APP_BASE_URL}/batch/${batchId}` : `/batch/${batchId}`;
}
