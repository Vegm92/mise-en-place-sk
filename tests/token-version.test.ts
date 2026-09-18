/**
 * Session revocation via users.token_version (issues #478, #1069).
 *
 * JWT sessions have no server-side record, so password reset/change and
 * account deletion can only take effect by having every subsequent request
 * compare the token's `tokenVersion` claim against the current DB value.
 * `checkTokenVersion` is that comparison — pulled out of the `jwt` callback
 * in src/lib/server/auth.ts so it's testable without going through Auth.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state, encodeMock } = vi.hoisted(() => ({
	state: {
		row: undefined as { tokenVersion: number } | undefined,
	},
	encodeMock: vi.fn().mockResolvedValue('encoded-jwt-token'),
}));

vi.mock('@auth/core/jwt', () => ({
	encode: encodeMock,
}));

vi.mock('$lib/server/db', () => {
	const limit = () => Promise.resolve(state.row ? [state.row] : []);
	const where = () => ({ limit });
	const from = () => ({ where });
	return { db: { select: () => ({ from }) } };
});

import { checkTokenVersion } from '../src/lib/server/token-version';
import { issueSessionCookie } from '../src/lib/server/auth-session';

beforeEach(() => {
	state.row = { tokenVersion: 0 };
	encodeMock.mockClear();
});

describe('checkTokenVersion', () => {
	it('rejects a token with no claim (undefined tokenVersion)', async () => {
		await expect(checkTokenVersion('user-1', undefined)).resolves.toBeNull();
	});

	it('accepts a token whose claim matches the current version', async () => {
		state.row = { tokenVersion: 3 };
		await expect(checkTokenVersion('user-1', 3)).resolves.toBe(3);
	});

	it('rejects a token minted before a password reset bumped the version', async () => {
		// User has tokenVersion 1 in database (e.g., after password reset/change)
		state.row = { tokenVersion: 1 };

		// A token minted while tokenVersion was 0 is presented — it must be rejected.
		await expect(checkTokenVersion('user-1', 0)).resolves.toBeNull();
	});

	it('rejects when the user row is gone (account deletion)', async () => {
		state.row = undefined;
		await expect(checkTokenVersion('user-1', 0)).resolves.toBeNull();
	});
});

describe('issueSessionCookie', () => {
	it('reads tokenVersion from DB and includes it in the minted token claim', async () => {
		state.row = { tokenVersion: 5 };
		const cookies = { set: vi.fn(), delete: vi.fn() } as never;
		const user = { id: 'user-1', email: 'test@example.com', name: 'Test User', image: null };

		await issueSessionCookie(cookies, false, user);

		expect(encodeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				token: expect.objectContaining({
					sub: 'user-1',
					tokenVersion: 5,
				}),
			})
		);
	});
});
