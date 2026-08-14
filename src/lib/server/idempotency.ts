import { db } from './db';
import { idempotencyKeys } from './schema';
import { and, eq, lt, notInArray } from 'drizzle-orm';
import type { BatchDb } from './batch-core';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FORM_SUBMIT_SCOPE = 'form-submit';
export const WHATSAPP_SCOPE = 'whatsapp';
export const STRIPE_WEBHOOK_SCOPE = 'stripe-webhook';

const RETENTION_HOURS: Record<string, number> = {
	[FORM_SUBMIT_SCOPE]: 48,
	[WHATSAPP_SCOPE]: 48,
	[STRIPE_WEBHOOK_SCOPE]: 96,
};

const DEFAULT_RETENTION_HOURS = 48;

export function isValidKey(key: unknown): key is string {
	return typeof key === 'string' && UUID_RE.test(key);
}

export async function claimIdempotencyKey(
	scope: string,
	key: string,
	opts: { restaurantId?: string | null; exec?: BatchDb } = {},
): Promise<boolean> {
	const exec = opts.exec ?? db;
	const rows = await exec.insert(idempotencyKeys)
		.values({ scope, key, restaurantId: opts.restaurantId ?? null })
		.onConflictDoNothing()
		.returning({ key: idempotencyKeys.key });
	return rows.length > 0;
}

export async function releaseIdempotencyKey(scope: string, key: string, exec: BatchDb = db): Promise<void> {
	await exec.delete(idempotencyKeys)
		.where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
}

export async function claimRequest(key: string, rid: string | null, exec: BatchDb = db): Promise<boolean> {
	return claimIdempotencyKey(FORM_SUBMIT_SCOPE, key, { restaurantId: rid, exec });
}

export async function releaseRequest(key: string, exec: BatchDb = db): Promise<void> {
	return releaseIdempotencyKey(FORM_SUBMIT_SCOPE, key, exec);
}

export async function sweepIdempotencyKeys(now: Date = new Date()): Promise<{ swept: number }> {
	const cutoff = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
	let swept = 0;

	for (const [scope, hours] of Object.entries(RETENTION_HOURS)) {
		const rows = await db.delete(idempotencyKeys)
			.where(and(eq(idempotencyKeys.scope, scope), lt(idempotencyKeys.claimedAt, cutoff(hours))))
			.returning({ key: idempotencyKeys.key });
		swept += rows.length;
	}

	const unknown = await db.delete(idempotencyKeys)
		.where(and(
			notInArray(idempotencyKeys.scope, Object.keys(RETENTION_HOURS)),
			lt(idempotencyKeys.claimedAt, cutoff(DEFAULT_RETENTION_HOURS)),
		))
		.returning({ key: idempotencyKeys.key });

	return { swept: swept + unknown.length };
}
