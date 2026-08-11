/**
 * GDPR consent audit trail (issue #201) — recordConsent/hasConsent, including
 * the 'oauth_signup' method now written by auth.ts's events.createUser hook
 * for brand-new Google sign-ins.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testSql, closeDb, hasDbEnv } from './helpers/test-db';
import { recordConsent, hasConsent, POLICY_VERSION } from '../src/lib/server/consent';

describe.skipIf(!hasDbEnv)('recordConsent / hasConsent', () => {
	const userId = `test-vitest-consent-${randomUUID()}`;

	afterAll(async () => {
		await testSql`DELETE FROM user_consents WHERE user_id = ${userId}`;
		await closeDb();
	});

	it('records consent and hasConsent reflects it', async () => {
		expect(await hasConsent(userId)).toBe(false);
		await recordConsent(userId, 'oauth_signup');
		expect(await hasConsent(userId)).toBe(true);
	});

	it('is idempotent for the same user + policy version (onConflictDoNothing)', async () => {
		await recordConsent(userId, 'oauth_signup');
		const rows = await testSql`
			SELECT method FROM user_consents
			WHERE user_id = ${userId} AND policy_version = ${POLICY_VERSION}
		`;
		expect(rows).toHaveLength(1);
		expect(rows[0].method).toBe('oauth_signup');
	});
});
