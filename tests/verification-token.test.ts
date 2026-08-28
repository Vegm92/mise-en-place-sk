/**
 * verification-token.ts — atomicity of consumeVerificationToken (issue #503)
 *
 * consumeVerificationToken must be a single statement: two concurrent
 * consumes of the same live token must not both succeed. A single
 * `DELETE ... WHERE identifier = ? AND token = ? AND expires > now()
 * RETURNING` satisfies this — Postgres serializes concurrent DELETEs that
 * target the same row, so only the first to commit finds a row to return;
 * the second re-evaluates the WHERE clause against the now-empty result and
 * deletes nothing.
 *
 * Skips without a local DATABASE_URL/DATABASE_TEST_URL, like the other
 * DB-backed suites (tests/helpers/db-gate.ts).
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { hasDbEnv, testSql, closeDb } from './helpers/test-db';
import { createVerificationToken, consumeVerificationToken } from '../src/lib/server/verification-token';

const describeDb = hasDbEnv ? describe : describe.skip;

const IDENTIFIER_PREFIX = 'test-vitest-verify:';

function uniqueIdentifier(suffix: string) {
	return `${IDENTIFIER_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

afterEach(async () => {
	if (hasDbEnv) await testSql`DELETE FROM verification_tokens WHERE identifier LIKE ${IDENTIFIER_PREFIX + '%'}`;
});

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

describeDb('consumeVerificationToken', () => {
	it('consumes a freshly created token exactly once', async () => {
		const identifier = uniqueIdentifier('once');
		const token = await createVerificationToken(identifier);

		expect(await consumeVerificationToken(identifier, token)).toBe(true);
		expect(await consumeVerificationToken(identifier, token)).toBe(false);
	});

	it('two concurrent consumes of the same live token: exactly one succeeds', async () => {
		const identifier = uniqueIdentifier('race');
		const token = await createVerificationToken(identifier);

		const results = await Promise.all([
			consumeVerificationToken(identifier, token),
			consumeVerificationToken(identifier, token),
		]);

		expect(results.filter(Boolean)).toHaveLength(1);

		const remaining = await testSql`
			SELECT 1 FROM verification_tokens WHERE identifier = ${identifier} AND token = ${token}
		`;
		expect(remaining).toHaveLength(0);
	});

	it('rejects an expired token and leaves the row in place (nothing sweeps expired rows)', async () => {
		const identifier = uniqueIdentifier('expired');
		const token = 'expired-token';
		await testSql`
			INSERT INTO verification_tokens (identifier, token, expires)
			VALUES (${identifier}, ${token}, now() - interval '1 hour')
		`;

		expect(await consumeVerificationToken(identifier, token)).toBe(false);

		const rows = await testSql`
			SELECT 1 FROM verification_tokens WHERE identifier = ${identifier} AND token = ${token}
		`;
		expect(rows).toHaveLength(1);
	});

	it('rejects a wrong token and leaves the real one consumable', async () => {
		const identifier = uniqueIdentifier('wrong');
		const token = await createVerificationToken(identifier);

		expect(await consumeVerificationToken(identifier, 'not-the-real-token')).toBe(false);
		expect(await consumeVerificationToken(identifier, token)).toBe(true);
	});
});

describeDb('createVerificationToken', () => {
	it('invalidates any prior token for the same identifier (issue #503)', async () => {
		const identifier = uniqueIdentifier('invalidate');
		const first = await createVerificationToken(identifier);
		const second = await createVerificationToken(identifier);

		expect(await consumeVerificationToken(identifier, first)).toBe(false);
		expect(await consumeVerificationToken(identifier, second)).toBe(true);
	});
});
