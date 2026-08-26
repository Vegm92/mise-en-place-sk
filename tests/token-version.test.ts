/**
 * Session revocation via users.token_version (issue #478).
 *
 * JWT sessions have no server-side record, so password reset/change and
 * account deletion can only take effect by having every subsequent request
 * compare the token's `tokenVersion` claim against the current DB value.
 * `checkTokenVersion` is that comparison — pulled out of the `jwt` callback
 * in src/lib/server/auth.ts so it's testable without going through Auth.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({
	state: {
		row: undefined as { tokenVersion: number } | undefined,
	},
}));

vi.mock('$lib/server/db', () => {
	const limit = () => Promise.resolve(state.row ? [state.row] : []);
	const where = () => ({ limit });
	const from = () => ({ where });
	return { db: { select: () => ({ from }) } };
});

import { checkTokenVersion } from '../src/lib/server/token-version';

beforeEach(() => {
	state.row = { tokenVersion: 0 };
});

describe('checkTokenVersion', () => {
	it('accepts a token with no claim yet and stamps the current version', async () => {
		await expect(checkTokenVersion('user-1', undefined)).resolves.toBe(0);
	});

	it('accepts a token whose claim matches the current version', async () => {
		state.row = { tokenVersion: 3 };
		await expect(checkTokenVersion('user-1', 3)).resolves.toBe(3);
	});

	it('rejects a token minted before a password reset bumped the version', async () => {
		// Token was minted while token_version was 0 (claim = 0).
		const claim = (await checkTokenVersion('user-1', undefined))!;
		expect(claim).toBe(0);

		// Password reset runs `tokenVersion: tokenVersion + 1` in the same
		// UPDATE as the password change.
		state.row = { tokenVersion: 1 };

		// The pre-reset token is presented again — it must be rejected.
		await expect(checkTokenVersion('user-1', claim)).resolves.toBeNull();
	});

	it('rejects when the user row is gone (account deletion)', async () => {
		state.row = undefined;
		await expect(checkTokenVersion('user-1', 0)).resolves.toBeNull();
	});
});
