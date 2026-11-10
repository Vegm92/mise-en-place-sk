/**
 * Issue #492: account deletion was four unprotected steps — Stripe cancel and
 * file deletion (irreversible, external) ran BEFORE the local commit, and
 * `db.delete(users)` ran entirely outside the transaction that removed the
 * restaurant/subscription/membership rows. A failure at any step left the
 * account in a partial state (files gone but account intact, subscription
 * cancelled but account intact, or a `users` row orphaned with no tenant).
 * There was also no re-authentication: any open session could delete the
 * account by echoing a fixed string back.
 *
 * The fix: (1) a single DB transaction deletes subscriptions, restaurants,
 * memberships and the user row together; (2) Stripe cancellation and file
 * deletion are collected as plain ids/keys BEFORE the transaction and only
 * acted on AFTER it commits, via a retryable pg-boss job (`enqueueAccountCleanup`,
 * tested against real dead-lettering in account-cleanup.test.ts); (3) a
 * password-holding account must re-authenticate with its current password
 * (verifyCredentials, the same primitive login uses); an OAuth-only account
 * (no passwordHash) keeps the typed `DELETE_MY_ACCOUNT` confirmation.
 *
 * DB-backed: the db singleton is swapped for the real test client so the
 * transaction actually runs against Postgres and a rollback is provable —
 * `state.failMidTransaction` makes the wrapped `db.transaction` throw right
 * after the handler's callback finishes its work but before the underlying
 * COMMIT, exactly like a real failure surfacing at the last step. Skipped
 * without DATABASE_URL.
 *
 * Phase 5 (RULE-275) changes two of those guarantees on purpose. The cleanup
 * job is now enqueued INSIDE the transaction, after the deletes and before the
 * commit, so a failed enqueue rolls the whole deletion back instead of leaving
 * a live Stripe subscription billing a deleted account. And a restaurant that
 * still has other members is no longer just abandoned: the longest-standing
 * remaining member becomes owner (emailed, audit-logged) and only restaurants
 * with no other members are erased.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { rateLimitMock, verifyCredentialsMock, enqueueAccountCleanupMock, sendEmailMock, logAuthEventMock, state } = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
	verifyCredentialsMock: vi.fn(),
	enqueueAccountCleanupMock: vi.fn().mockResolvedValue(true),
	sendEmailMock: vi.fn().mockResolvedValue(undefined),
	logAuthEventMock: vi.fn(),
	state: { failMidTransaction: false },
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/auth-credentials', () => ({ verifyCredentials: verifyCredentialsMock }));
vi.mock('$lib/server/queue', () => ({ enqueueAccountCleanup: enqueueAccountCleanupMock }));
vi.mock('$lib/server/email', async (importOriginal) => ({ ...(await importOriginal<object>()), sendEmail: sendEmailMock }));
vi.mock('$lib/server/auth-events', () => ({ logAuthEvent: logAuthEventMock, hashIp: () => 'iphash' }));

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	// testDb is null when the DB gate is off — its NonNullable is a type
	// assertion, not a runtime guarantee. The suite below is describe.skipIf'd
	// in that case, but this factory still runs at import time, and
	// `new Proxy(null, ...)` throws, failing the whole file at collection
	// instead of skipping it. Hand back an inert stand-in: nothing reads it.
	if (!testDb) return { db: {}, forTenant, runAsSystem: (fn: () => unknown) => fn() };
	const db = new Proxy(testDb as object, {
		get(target, prop, receiver) {
			if (prop === 'transaction') {
				return async (fn: (tx: unknown) => Promise<unknown>) =>
					(target as { transaction: (f: (tx: unknown) => Promise<unknown>) => Promise<unknown> }).transaction(
						async (tx: unknown) => {
							const result = await fn(tx);
							if (state.failMidTransaction) throw new Error('injected-mid-transaction-failure');
							return result;
						},
					);
			}
			return Reflect.get(target, prop, receiver);
		},
	});
	return { db, forTenant, runAsSystem: (fn: () => unknown) => fn() };
});

import { testSql, closeDb, hasDbEnv } from './helpers/test-db';
import { POST } from '../src/routes/api/user/delete/+server';

async function makeUser(suffix: string, passwordHash: string | null = null) {
	const email = `acct-del-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
	const [row] = await testSql`
		INSERT INTO users (email, name, password_hash, email_verified)
		VALUES (${email}, ${'Chef ' + suffix}, ${passwordHash}, now())
		RETURNING id
	`;
	return { id: row!.id as string, email };
}

async function makeRestaurant(suffix: string) {
	const slug = `test-vitest-acct-del-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const [row] = await testSql`INSERT INTO restaurants (name, slug) VALUES (${'Rest ' + suffix}, ${slug}) RETURNING id`;
	return row!.id as string;
}

async function membership(
	userId: string, restaurantId: string, role: 'owner' | 'member' = 'owner', joinedAt: string | null = null,
) {
	await testSql`
		INSERT INTO user_restaurants (user_id, restaurant_id, role, created_at)
		VALUES (${userId}, ${restaurantId}, ${role}, coalesce(${joinedAt}::timestamptz, now()))
	`;
}

async function roleOf(userId: string, restaurantId: string) {
	const [row] = await testSql`SELECT role FROM user_restaurants WHERE user_id = ${userId} AND restaurant_id = ${restaurantId}`;
	return (row?.role as string | undefined) ?? null;
}

async function setSubscription(restaurantId: string, stripeSubscriptionId: string) {
	await testSql`
		INSERT INTO subscriptions (restaurant_id, stripe_subscription_id, status)
		VALUES (${restaurantId}, ${stripeSubscriptionId}, 'active')
	`;
}

async function addInvoiceFile(restaurantId: string, sourceFile: string) {
	await testSql`INSERT INTO invoices (restaurant_id, source_file) VALUES (${restaurantId}, ${sourceFile})`;
}

async function seedOwnedRestaurant(userId: string, suffix: string) {
	const rid = await makeRestaurant(suffix);
	await membership(userId, rid, 'owner');
	const subId = `sub_${suffix}_${Date.now()}`;
	const fileKey = `invoices/${suffix}-${Date.now()}.pdf`;
	await setSubscription(rid, subId);
	await addInvoiceFile(rid, fileKey);
	return { rid, subId, fileKey };
}

async function userExists(id: string) {
	return (await testSql`SELECT id FROM users WHERE id = ${id}`).length > 0;
}
async function restaurantExists(id: string) {
	return (await testSql`SELECT id FROM restaurants WHERE id = ${id}`).length > 0;
}
async function membershipCount(userId: string) {
	return (await testSql`SELECT restaurant_id FROM user_restaurants WHERE user_id = ${userId}`).length;
}
async function subscriptionExists(restaurantId: string) {
	return (await testSql`SELECT id FROM subscriptions WHERE restaurant_id = ${restaurantId}`).length > 0;
}

function deleteEvent(userId: string, email: string, body: unknown, cookieDelete = vi.fn()) {
	return {
		locals: { user: { id: userId, email, name: null, image: null } },
		request: { json: async () => body },
		cookies: { delete: cookieDelete },
	} as never;
}

async function runDelete(userId: string, email: string, body: unknown, cookieDelete = vi.fn()) {
	try {
		const res = await POST(deleteEvent(userId, email, body, cookieDelete));
		const parsed = (await res.json()) as { deleted?: boolean; error?: string };
		if (!res.ok) return { thrown: true as const, status: res.status, message: parsed.error };
		return { thrown: false as const, status: res.status, json: parsed as { deleted: boolean } };
	} catch (thrown) {
		const t = thrown as { status?: number; body?: { message: string }; message?: string };
		return { thrown: true as const, status: t.status, message: t.body?.message ?? t.message };
	}
}

async function runDeleteAsOwner(userId: string, email: string) {
	verifyCredentialsMock.mockResolvedValue({ id: userId, email, name: null, image: null });
	return runDelete(userId, email, { password: 'correct-horse' });
}

async function cleanupUserAndRestaurants(userId: string, restaurantIds: string[]) {
	for (const rid of restaurantIds) await testSql`DELETE FROM restaurants WHERE id = ${rid}`;
	await testSql`DELETE FROM users WHERE id = ${userId}`;
}

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
	verifyCredentialsMock.mockReset();
	enqueueAccountCleanupMock.mockReset().mockResolvedValue(true);
	sendEmailMock.mockReset().mockResolvedValue(undefined);
	logAuthEventMock.mockClear();
	state.failMidTransaction = false;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('POST /api/user/delete (issue #492)', () => {
	it('wrong password: 401, and nothing is deleted', async () => {
		const { id: userId, email } = await makeUser('wrongpw', 'hashed:whatever');
		const rid = await makeRestaurant('wrongpw');
		await membership(userId, rid, 'owner');
		verifyCredentialsMock.mockResolvedValue(null);

		const result = await runDelete(userId, email, { password: 'not-the-password' });

		expect(result).toMatchObject({ thrown: true, status: 401 });
		expect(await userExists(userId)).toBe(true);
		expect(await restaurantExists(rid)).toBe(true);
		expect(await membershipCount(userId)).toBe(1);
		expect(enqueueAccountCleanupMock).not.toHaveBeenCalled();

		await cleanupUserAndRestaurants(userId, [rid]);
	});

	it('password account with no password in the body: 400, nothing is deleted', async () => {
		const { id: userId, email } = await makeUser('nopw', 'hashed:whatever');

		const result = await runDelete(userId, email, {});

		expect(result).toMatchObject({ thrown: true, status: 400 });
		expect(verifyCredentialsMock).not.toHaveBeenCalled();
		expect(await userExists(userId)).toBe(true);

		await testSql`DELETE FROM users WHERE id = ${userId}`;
	});

	it('OAuth-only account (no passwordHash) proceeds on the typed DELETE_MY_ACCOUNT confirmation', async () => {
		const { id: userId, email } = await makeUser('oauth', null);
		const rid = await makeRestaurant('oauth');
		await membership(userId, rid, 'owner');

		const result = await runDelete(userId, email, { confirm: 'DELETE_MY_ACCOUNT' });

		expect(result).toMatchObject({ thrown: false, status: 200, json: { deleted: true } });
		expect(verifyCredentialsMock).not.toHaveBeenCalled();
		expect(await userExists(userId)).toBe(false);
		expect(await restaurantExists(rid)).toBe(false);
	});

	it('OAuth-only account with a wrong/missing confirmation: 400, nothing deleted', async () => {
		const { id: userId, email } = await makeUser('oauth-bad', null);
		const rid = await makeRestaurant('oauth-bad');
		await membership(userId, rid, 'owner');

		const result = await runDelete(userId, email, { confirm: 'nope' });

		expect(result).toMatchObject({ thrown: true, status: 400 });
		expect(await userExists(userId)).toBe(true);
		expect(await restaurantExists(rid)).toBe(true);

		await cleanupUserAndRestaurants(userId, [rid]);
	});

	it('a failure injected at commit time leaves no partial state', async () => {
		const { id: userId, email } = await makeUser('midtx', 'hashed:pw');
		const rid = await makeRestaurant('midtx');
		await membership(userId, rid, 'owner');
		await setSubscription(rid, `sub_midtx_${Date.now()}`);
		await addInvoiceFile(rid, `invoices/midtx-${Date.now()}.pdf`);
		verifyCredentialsMock.mockResolvedValue({ id: userId, email, name: null, image: null });
		state.failMidTransaction = true;

		const result = await runDelete(userId, email, { password: 'correct-horse' });

		expect(result.thrown).toBe(true);
		expect(await userExists(userId)).toBe(true);
		expect(await restaurantExists(rid)).toBe(true);
		expect(await subscriptionExists(rid)).toBe(true);
		expect(await membershipCount(userId)).toBe(1);

		await cleanupUserAndRestaurants(userId, [rid]);
	});

	it('success path: all rows gone, and cleanup is enqueued inside the transaction, before the commit (real DB read inside the mock)', async () => {
		const { id: userId, email } = await makeUser('success', 'hashed:pw');
		const { rid, subId, fileKey } = await seedOwnedRestaurant(userId, 'success');
		verifyCredentialsMock.mockResolvedValue({ id: userId, email, name: null, image: null });

		let userStillPresentWhenEnqueued: boolean | null = null;
		enqueueAccountCleanupMock.mockImplementationOnce(async (uid: string) => {
			userStillPresentWhenEnqueued = await userExists(uid);
			return true;
		});

		const result = await runDelete(userId, email, { password: 'correct-horse' });

		expect(result).toMatchObject({ thrown: false, status: 200, json: { deleted: true } });
		expect(await userExists(userId)).toBe(false);
		expect(await restaurantExists(rid)).toBe(false);
		expect(userStillPresentWhenEnqueued).toBe(true);

		expect(enqueueAccountCleanupMock).toHaveBeenCalledTimes(1);
		expect(enqueueAccountCleanupMock).toHaveBeenCalledWith(userId, rid, [subId], [fileKey], undefined);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('does not enqueue cleanup when there is nothing to clean up (no subscription, no files)', async () => {
		const { id: userId, email } = await makeUser('nocleanup', 'hashed:pw');
		const rid = await makeRestaurant('nocleanup');
		await membership(userId, rid, 'owner');
		verifyCredentialsMock.mockResolvedValue({ id: userId, email, name: null, image: null });

		const result = await runDelete(userId, email, { password: 'correct-horse' });

		expect(result).toMatchObject({ thrown: false, status: 200 });
		expect(enqueueAccountCleanupMock).not.toHaveBeenCalled();
	});

	it('a restaurant with other members is kept and ownership passes to the longest-standing member, who is emailed and audit-logged (RULE-275)', async () => {
		const { id: ownerId, email: ownerEmail } = await makeUser('xfer-owner', 'hashed:pw');
		const { id: newerId } = await makeUser('xfer-newer', null);
		const { id: olderId, email: olderEmail } = await makeUser('xfer-older', null);
		const rid = await makeRestaurant('xfer');
		await membership(ownerId, rid, 'owner', '2020-01-01T00:00:00Z');
		await membership(newerId, rid, 'member', '2024-06-01T00:00:00Z');
		await membership(olderId, rid, 'member', '2022-03-01T00:00:00Z');
		await setSubscription(rid, `sub_xfer_${Date.now()}`);
		verifyCredentialsMock.mockResolvedValue({ id: ownerId, email: ownerEmail, name: null, image: null });

		const result = await runDelete(ownerId, ownerEmail, { password: 'correct-horse' });

		expect(result).toMatchObject({ thrown: false, status: 200 });
		expect(await userExists(ownerId)).toBe(false);
		expect(await restaurantExists(rid)).toBe(true);
		expect(await subscriptionExists(rid)).toBe(true);
		expect(await roleOf(olderId, rid)).toBe('owner');
		expect(await roleOf(newerId, rid)).toBe('member');
		expect(enqueueAccountCleanupMock).not.toHaveBeenCalled();
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock.mock.calls[0]![0]).toMatchObject({ to: olderEmail, kind: 'ownership_transfer' });
		expect(logAuthEventMock).toHaveBeenCalledWith('ownership_transferred', {
			restaurantId: rid, fromUserId: ownerId, toUserId: olderId,
		});

		await testSql`DELETE FROM users WHERE id IN (${newerId}, ${olderId})`;
		await testSql`DELETE FROM restaurants WHERE id = ${rid}`;
	});

	it('a restaurant that already has another owner is left alone: no transfer, no email', async () => {
		const { id: ownerId, email: ownerEmail } = await makeUser('coowner-a', 'hashed:pw');
		const { id: coOwnerId } = await makeUser('coowner-b', null);
		const { id: memberId } = await makeUser('coowner-c', null);
		const rid = await makeRestaurant('coowner');
		await membership(ownerId, rid, 'owner', '2020-01-01T00:00:00Z');
		await membership(memberId, rid, 'member', '2021-01-01T00:00:00Z');
		await membership(coOwnerId, rid, 'owner', '2023-01-01T00:00:00Z');
		verifyCredentialsMock.mockResolvedValue({ id: ownerId, email: ownerEmail, name: null, image: null });

		const result = await runDelete(ownerId, ownerEmail, { password: 'correct-horse' });

		expect(result).toMatchObject({ thrown: false, status: 200 });
		expect(await restaurantExists(rid)).toBe(true);
		expect(await roleOf(memberId, rid)).toBe('member');
		expect(await roleOf(coOwnerId, rid)).toBe('owner');
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(logAuthEventMock).not.toHaveBeenCalled();

		await testSql`DELETE FROM users WHERE id IN (${coOwnerId}, ${memberId})`;
		await testSql`DELETE FROM restaurants WHERE id = ${rid}`;
	});

	it('with one shared and one sole-owned restaurant, only the sole-owned one is erased and cancelled', async () => {
		const { id: ownerId, email: ownerEmail } = await makeUser('mix-owner', 'hashed:pw');
		const { id: memberId } = await makeUser('mix-member', null);
		const shared = await seedOwnedRestaurant(ownerId, 'mix-shared');
		await membership(memberId, shared.rid, 'member');
		const sole = await seedOwnedRestaurant(ownerId, 'mix-sole');
		verifyCredentialsMock.mockResolvedValue({ id: ownerId, email: ownerEmail, name: null, image: null });

		const result = await runDelete(ownerId, ownerEmail, { password: 'correct-horse' });

		expect(result).toMatchObject({ thrown: false, status: 200 });
		expect(await restaurantExists(shared.rid)).toBe(true);
		expect(await restaurantExists(sole.rid)).toBe(false);
		expect(await roleOf(memberId, shared.rid)).toBe('owner');
		expect(enqueueAccountCleanupMock).toHaveBeenCalledTimes(1);
		expect(enqueueAccountCleanupMock).toHaveBeenCalledWith(ownerId, sole.rid, [sole.subId], [sole.fileKey], undefined);

		await testSql`DELETE FROM users WHERE id = ${memberId}`;
		await testSql`DELETE FROM restaurants WHERE id = ${shared.rid}`;
	});

	it('an ownership-email failure does not undo the deletion', async () => {
		const { id: ownerId, email: ownerEmail } = await makeUser('mailfail-owner', 'hashed:pw');
		const { id: memberId } = await makeUser('mailfail-member', null);
		const rid = await makeRestaurant('mailfail');
		await membership(ownerId, rid, 'owner');
		await membership(memberId, rid, 'member');
		verifyCredentialsMock.mockResolvedValue({ id: ownerId, email: ownerEmail, name: null, image: null });
		sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

		const result = await runDelete(ownerId, ownerEmail, { password: 'correct-horse' });

		expect(result).toMatchObject({ thrown: false, status: 200, json: { deleted: true } });
		expect(await userExists(ownerId)).toBe(false);
		expect(await roleOf(memberId, rid)).toBe('owner');

		await testSql`DELETE FROM users WHERE id = ${memberId}`;
		await testSql`DELETE FROM restaurants WHERE id = ${rid}`;
	});

	it('a failed cleanup enqueue aborts the whole deletion: user, restaurant, subscription and ownership are untouched (RULE-275)', async () => {
		const { id: ownerId, email: ownerEmail } = await makeUser('abort-owner', 'hashed:pw');
		const { id: memberId } = await makeUser('abort-member', null);
		const shared = await seedOwnedRestaurant(ownerId, 'abort-shared');
		await membership(memberId, shared.rid, 'member');
		const sole = await seedOwnedRestaurant(ownerId, 'abort-sole');
		verifyCredentialsMock.mockResolvedValue({ id: ownerId, email: ownerEmail, name: null, image: null });
		enqueueAccountCleanupMock.mockRejectedValue(new Error('queue down'));

		const result = await runDelete(ownerId, ownerEmail, { password: 'correct-horse' });

		expect(result.thrown).toBe(true);
		expect(await userExists(ownerId)).toBe(true);
		expect(await restaurantExists(sole.rid)).toBe(true);
		expect(await subscriptionExists(sole.rid)).toBe(true);
		expect(await roleOf(ownerId, shared.rid)).toBe('owner');
		expect(await roleOf(memberId, shared.rid)).toBe('member');
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(logAuthEventMock).not.toHaveBeenCalled();

		await testSql`DELETE FROM users WHERE id = ${memberId}`;
		await cleanupUserAndRestaurants(ownerId, [shared.rid, sole.rid]);
	});

	it('deletes real rows across every FK depth of the shared tenant-data map — suppliers, chained invoice/line-item rows, chained chat rows, and subscriptions — without an FK-order violation (issue #390)', async () => {
		const { id: userId, email } = await makeUser('mapfk', 'hashed:pw');
		const rid = await makeRestaurant('mapfk');
		await membership(userId, rid, 'owner');
		verifyCredentialsMock.mockResolvedValue({ id: userId, email, name: null, image: null });

		await setSubscription(rid, `sub_mapfk_${Date.now()}`);
		await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, 'MapFK Supplier')`;
		const [invoiceRow] = await testSql`
			INSERT INTO invoices (restaurant_id, invoice_number) VALUES (${rid}, 'MAPFK-1') RETURNING id
		`;
		await testSql`
			INSERT INTO invoice_line_items (restaurant_id, invoice_id, description)
			VALUES (${rid}, ${invoiceRow!.id}, 'line 1')
		`;
		const [sessionRow] = await testSql`
			INSERT INTO chat_sessions (restaurant_id, title) VALUES (${rid}, 'session') RETURNING id
		`;
		await testSql`
			INSERT INTO chat_messages (restaurant_id, session_id, role, text)
			VALUES (${rid}, ${sessionRow!.id}, 'user', 'hi')
		`;
		const [productRow] = await testSql`
			INSERT INTO products (restaurant_id, canonical_name, name_key) VALUES (${rid}, 'Aceite', 'aceite-mapfk') RETURNING id
		`;
		await testSql`
			INSERT INTO product_aliases (restaurant_id, product_id, raw_key) VALUES (${rid}, ${productRow!.id}, 'aceite-raw')
		`;
		const [batchRow] = await testSql`INSERT INTO upload_batches (restaurant_id) VALUES (${rid}) RETURNING id`;
		await testSql`
			INSERT INTO batch_items (batch_id, restaurant_id, position, file_key, display_name)
			VALUES (${batchRow!.id}, ${rid}, 1, 'k', 'd')
		`;

		const result = await runDelete(userId, email, { password: 'correct-horse' });

		expect(result).toMatchObject({ thrown: false, status: 200, json: { deleted: true } });
		expect(await restaurantExists(rid)).toBe(false);
		expect(await subscriptionExists(rid)).toBe(false);
		expect(await testSql`SELECT id FROM suppliers WHERE restaurant_id = ${rid}`).toHaveLength(0);
		expect(await testSql`SELECT id FROM invoices WHERE restaurant_id = ${rid}`).toHaveLength(0);
		expect(await testSql`SELECT id FROM invoice_line_items WHERE restaurant_id = ${rid}`).toHaveLength(0);
		expect(await testSql`SELECT id FROM chat_sessions WHERE restaurant_id = ${rid}`).toHaveLength(0);
		expect(await testSql`SELECT id FROM chat_messages WHERE restaurant_id = ${rid}`).toHaveLength(0);
		expect(await testSql`SELECT id FROM products WHERE restaurant_id = ${rid}`).toHaveLength(0);
		expect(await testSql`SELECT id FROM product_aliases WHERE restaurant_id = ${rid}`).toHaveLength(0);
		expect(await testSql`SELECT id FROM upload_batches WHERE restaurant_id = ${rid}`).toHaveLength(0);
		expect(await testSql`SELECT id FROM batch_items WHERE restaurant_id = ${rid}`).toHaveLength(0);
	});

	it('a user who solely owns two restaurants gets both subscriptions cancelled and both sets of files collected', async () => {
		const { id: userId, email } = await makeUser('multi', 'hashed:pw');
		const a = await seedOwnedRestaurant(userId, 'multi-a');
		const b = await seedOwnedRestaurant(userId, 'multi-b');

		const result = await runDeleteAsOwner(userId, email);

		expect(result).toMatchObject({ thrown: false, status: 200, json: { deleted: true } });
		expect(await restaurantExists(a.rid)).toBe(false);
		expect(await restaurantExists(b.rid)).toBe(false);

		expect(enqueueAccountCleanupMock).toHaveBeenCalledTimes(1);
		const [uid, , subIds, keys] = enqueueAccountCleanupMock.mock.calls[0] as [string, string | null, string[], string[]];
		expect(uid).toBe(userId);
		expect([...subIds].sort()).toEqual([a.subId, b.subId].sort());
		expect([...keys].sort()).toEqual([a.fileKey, b.fileKey].sort());
	});

	it('rate limits deletion attempts', async () => {
		const { id: userId, email } = await makeUser('ratelimited', 'hashed:pw');
		rateLimitMock.mockResolvedValueOnce(false);

		const result = await runDelete(userId, email, { password: 'whatever' });

		expect(result).toMatchObject({ thrown: true, status: 429 });
		expect(verifyCredentialsMock).not.toHaveBeenCalled();
		expect(await userExists(userId)).toBe(true);

		await testSql`DELETE FROM users WHERE id = ${userId}`;
	});
});
