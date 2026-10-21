/**
 * RULE-277 (Phase 5): resetting a password through the emailed link proves
 * the user controls the inbox, so it also marks the email verified — without
 * overwriting a verification timestamp that already exists. DB-backed;
 * skipped without DATABASE_URL.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { formDataEvent } from './helpers/form-data';

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('$lib/server/auth-events', () => ({ logAuthEvent: vi.fn(), hashIp: () => 'iphash' }));
vi.mock('$lib/server/verification-token', () => ({
	consumeVerificationToken: vi.fn().mockResolvedValue(true),
	createVerificationToken: vi.fn(),
}));
vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	return { db: testDb, runAsSystem: (fn: () => unknown) => fn() };
});

import { testSql, closeDb, hasDbEnv } from './helpers/test-db';
import { actions } from '../src/routes/reset-password/+page.server';

const consumeMock = vi.mocked((await import('$lib/server/verification-token')).consumeVerificationToken);

async function makeUser(verifiedAt: string | null) {
	const email = `reset-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
	const [row] = await testSql`
		INSERT INTO users (email, name, password_hash, email_verified)
		VALUES (${email}, 'Chef', 'old-hash', ${verifiedAt})
		RETURNING id
	`;
	return { id: row!.id as string, email };
}

async function reset(email: string) {
	const data = new FormData();
	data.append('email', email);
	data.append('token', 'tok');
	data.append('password', 'longenough123');
	data.append('confirm', 'longenough123');
	const event = formDataEvent(data, {
		url: new URL('https://app.example.test'),
		getClientAddress: () => '203.0.113.7',
		cookies: { delete: vi.fn() },
	}) as never;
	return Promise.resolve(actions.default!(event)).catch((e: unknown) => e);
}

async function verifiedAt(id: string) {
	const [row] = await testSql`SELECT email_verified IS NOT NULL AS verified, extract(epoch FROM email_verified)::float8 AS secs FROM users WHERE id = ${id}`;
	return { verified: row!.verified as boolean, secs: row!.secs as number | null };
}

beforeEach(() => consumeMock.mockReset().mockResolvedValue(true));

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

describe.skipIf(!hasDbEnv)('/reset-password marks the email verified (RULE-277)', () => {
	it('verifies an unverified account', async () => {
		const { id, email } = await makeUser(null);

		const thrown = await reset(email);

		expect(isRedirect(thrown)).toBe(true);
		expect((await verifiedAt(id)).verified).toBe(true);
		await testSql`DELETE FROM users WHERE id = ${id}`;
	});

	it('keeps the original verification time of an already-verified account', async () => {
		const original = '2020-01-02T03:04:05.000Z';
		const { id, email } = await makeUser(original);

		await reset(email);

		expect((await verifiedAt(id)).secs).toBe(Date.parse(original) / 1000);
		await testSql`DELETE FROM users WHERE id = ${id}`;
	});

	it('does not verify the email when the token is rejected', async () => {
		const { id, email } = await makeUser(null);
		consumeMock.mockResolvedValue(false);

		await reset(email);

		expect((await verifiedAt(id)).verified).toBe(false);
		await testSql`DELETE FROM users WHERE id = ${id}`;
	});
});
