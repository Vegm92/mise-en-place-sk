/**
 * Shared idempotency ledger (issue #389, consolidating #240/#245/#250) — runs
 * the real INSERT … ON CONFLICT DO NOTHING RETURNING against the test DB.
 *
 * Invariants: the first claim of a (scope, key) wins; a replay is a no-op
 * (false); releasing lets a corrected resubmit re-claim; the same key under a
 * different scope is a different claim; the sweep expires each scope on its
 * own retention window.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
	testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import {
	claimRequest, releaseRequest, isValidKey, claimIdempotencyKey, releaseIdempotencyKey,
	sweepIdempotencyKeys, FORM_SUBMIT_SCOPE, WHATSAPP_SCOPE, STRIPE_WEBHOOK_SCOPE,
} from '../src/lib/server/idempotency';
import { idempotencyKeys } from '../src/lib/server/schema';

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('idem')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid); // idempotency_keys cascade on restaurant delete
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

describe.skipIf(!hasDbEnv)('claimIdempotencyKey scopes', () => {
	const keys: string[] = [];

	afterAll(async () => {
		await testDb.delete(idempotencyKeys).where(inArray(idempotencyKeys.key, keys));
	});

	it('treats the same key under two scopes as two claims', async () => {
		const key = `test-vitest-shared-${randomUUID()}`;
		keys.push(key);
		expect(await claimIdempotencyKey(WHATSAPP_SCOPE, key, { exec: testDb })).toBe(true);
		expect(await claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, key, { exec: testDb })).toBe(true);
		expect(await claimIdempotencyKey(WHATSAPP_SCOPE, key, { exec: testDb })).toBe(false);
	});

	it('releases only the claim in the given scope', async () => {
		const key = `test-vitest-release-${randomUUID()}`;
		keys.push(key);
		await claimIdempotencyKey(WHATSAPP_SCOPE, key, { exec: testDb });
		await claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, key, { exec: testDb });

		await releaseIdempotencyKey(WHATSAPP_SCOPE, key, testDb);

		expect(await claimIdempotencyKey(WHATSAPP_SCOPE, key, { exec: testDb })).toBe(true);
		expect(await claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, key, { exec: testDb })).toBe(false);
	});

	it('stores the tenant so the claim dies with the restaurant', async () => {
		const key = `test-vitest-tenant-${randomUUID()}`;
		keys.push(key);
		await claimIdempotencyKey(FORM_SUBMIT_SCOPE, key, { restaurantId: rid, exec: testDb });

		const rows = await testDb.select({ restaurantId: idempotencyKeys.restaurantId })
			.from(idempotencyKeys)
			.where(and(eq(idempotencyKeys.scope, FORM_SUBMIT_SCOPE), eq(idempotencyKeys.key, key)));
		expect(rows[0]?.restaurantId).toBe(rid);
	});
});

describe.skipIf(!hasDbEnv)('sweepIdempotencyKeys (#428)', () => {
	const waFresh = `test-vitest-wa-fresh-${randomUUID()}`;
	const waStale = `test-vitest-wa-stale-${randomUUID()}`;
	const stripeMid = `test-vitest-stripe-mid-${randomUUID()}`;
	const stripeStale = `test-vitest-stripe-stale-${randomUUID()}`;
	const all = [waFresh, waStale, stripeMid, stripeStale];

	afterAll(async () => {
		await testDb.delete(idempotencyKeys).where(inArray(idempotencyKeys.key, all));
	});

	it('expires each scope on its own retention window', async () => {
		await claimIdempotencyKey(WHATSAPP_SCOPE, waFresh, { exec: testDb });
		await claimIdempotencyKey(WHATSAPP_SCOPE, waStale, { exec: testDb });
		await claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, stripeMid, { exec: testDb });
		await claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, stripeStale, { exec: testDb });
		await testSql`UPDATE idempotency_keys SET claimed_at = now() - interval '49 hours' WHERE key IN (${waStale}, ${stripeMid})`;
		await testSql`UPDATE idempotency_keys SET claimed_at = now() - interval '97 hours' WHERE key = ${stripeStale}`;

		await sweepIdempotencyKeys();

		const remaining = await testDb
			.select({ key: idempotencyKeys.key })
			.from(idempotencyKeys)
			.where(inArray(idempotencyKeys.key, all));
		expect(remaining.map(r => r.key).sort()).toEqual([waFresh, stripeMid].sort());
	});
});
