import { db } from './db';
import { processedRequests, whatsappProcessedMessages } from './schema';
import { eq, lt } from 'drizzle-orm';
import type { BatchDb } from './batch-core';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidKey(key: unknown): key is string {
	return typeof key === 'string' && UUID_RE.test(key);
}

export async function claimRequest(key: string, rid: string | null, exec: BatchDb = db): Promise<boolean> {
	const rows = await exec.insert(processedRequests)
		.values({ key, restaurantId: rid })
		.onConflictDoNothing()
		.returning({ key: processedRequests.key });
	return rows.length > 0;
}

export async function releaseRequest(key: string, exec: BatchDb = db): Promise<void> {
	await exec.delete(processedRequests).where(eq(processedRequests.key, key));
}

export async function cleanupProcessedRequests(): Promise<void> {
	const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
	await db.delete(processedRequests).where(lt(processedRequests.createdAt, cutoff));
}

export async function cleanupProcessedWhatsAppMessages(): Promise<void> {
	const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
	await db.delete(whatsappProcessedMessages).where(lt(whatsappProcessedMessages.receivedAt, cutoff));
}
