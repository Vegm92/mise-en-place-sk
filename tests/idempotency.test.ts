/**
 * Idempotency-key claim helper (issue #250) — runs the real
 * INSERT … ON CONFLICT DO NOTHING RETURNING against the test DB.
 *
 * Invariant: the first claim of a key wins; a replay of the same key is a
 * no-op (false); releasing a key lets a corrected resubmit re-claim it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	testDb, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { claimRequest, releaseRequest, isValidKey } from '../src/lib/server/idempotency';

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
