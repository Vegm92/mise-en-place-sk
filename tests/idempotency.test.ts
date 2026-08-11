/**
 * Idempotency-key claim helper (issue #250) — runs the real
 * INSERT … ON CONFLICT DO NOTHING RETURNING against the test DB.
 *
 * Invariant: the first claim of a key wins; a replay of the same key is a
 * no-op (false); releasing a key lets a corrected resubmit re-claim it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import {
	testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import {
	claimRequest, releaseRequest, isValidKey, cleanupProcessedWhatsAppMessages,
} from '../src/lib/server/idempotency';
import { whatsappProcessedMessages } from '../src/lib/server/schema';

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('idem')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid); // processed_requests cascade on restaurant delete
	await closeDb();
});

describe('isValidKey', () => {
	it('accepts a UUID and rejects anything else', () => {
		expect(isValidKey(randomUUID())).toBe(true);
		expect(isValidKey('not-a-uuid')).toBe(false);
		expect(isValidKey(null)).toBe(false);
		expect(isValidKey(42)).toBe(false);
	});
});

describe.skipIf(!hasDbEnv)('claimRequest / releaseRequest', () => {
	it('claims a fresh key once and rejects the replay', async () => {
		const key = randomUUID();
		expect(await claimRequest(key, rid, testDb)).toBe(true);
		expect(await claimRequest(key, rid, testDb)).toBe(false);
	});

	it('re-claims after the key is released', async () => {
		const key = randomUUID();
		expect(await claimRequest(key, rid, testDb)).toBe(true);
		await releaseRequest(key, testDb);
		expect(await claimRequest(key, rid, testDb)).toBe(true);
	});

	it('allows a null tenant (onboarding precedes the restaurant)', async () => {
		const key = randomUUID();
		expect(await claimRequest(key, null, testDb)).toBe(true);
		expect(await claimRequest(key, null, testDb)).toBe(false);
	});
});

describe.skipIf(!hasDbEnv)('cleanupProcessedWhatsAppMessages (#428)', () => {
	const freshId = `test-vitest-wa-fresh-${randomUUID()}`;
	const staleId = `test-vitest-wa-stale-${randomUUID()}`;

	afterAll(async () => {
		await testSql`DELETE FROM whatsapp_processed_messages WHERE message_id IN (${freshId}, ${staleId})`;
	});

	it('deletes rows past the 48h redelivery-dedup window, leaves recent ones', async () => {
		await testDb.insert(whatsappProcessedMessages).values({ messageId: freshId }).onConflictDoNothing();
		await testDb.insert(whatsappProcessedMessages).values({ messageId: staleId }).onConflictDoNothing();
		await testSql`UPDATE whatsapp_processed_messages SET received_at = now() - interval '49 hours' WHERE message_id = ${staleId}`;

		await cleanupProcessedWhatsAppMessages();

		const remaining = await testDb
			.select({ id: whatsappProcessedMessages.messageId })
			.from(whatsappProcessedMessages)
			.where(inArray(whatsappProcessedMessages.messageId, [freshId, staleId]));
		expect(remaining.map(r => r.id)).toEqual([freshId]);
	});
});
