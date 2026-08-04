/**
 * Password recovery routes (issue #284).
 *
 * /forgot-password must be an account-enumeration dead end: the same answer
 * whether or not the address exists, and rate limited per IP and per email.
 * /reset-password must refuse without a valid token, enforce the password
 * rules, and clear the session so the new password is actually exercised.
 *
 * db, the verification-token helper, email, the rate limiter and auth
 * telemetry are mocked — this isolates the action logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

const {
	rateLimitMock, logAuthEventMock, createVerificationTokenMock, consumeVerificationTokenMock,
	sendEmailMock, state, updatedRows, deletedCookies,
} = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
	logAuthEventMock: vi.fn(),
	createVerificationTokenMock: vi.fn().mockResolvedValue('tok123'),
	consumeVerificationTokenMock: vi.fn().mockResolvedValue(true),
	sendEmailMock: vi.fn().mockResolvedValue(undefined),
	state: { userExists: true as boolean },
	updatedRows: [] as Array<Record<string, unknown>>,
	deletedCookies: [] as string[],
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/auth-events', () => ({
	logAuthEvent: logAuthEventMock,
	hashIp: () => 'iphash',
}));
vi.mock('$lib/server/verification-token', () => ({
	createVerificationToken: createVerificationTokenMock,
	consumeVerificationToken: consumeVerificationTokenMock,
}));
vi.mock('$lib/server/email', () => ({
	sendEmail: sendEmailMock,
	resetPasswordEmail: (email: string, url: string) => ({ to: email, subject: 's', html: url }),
}));
vi.mock('$lib/server/db', () => {
	const select = () => ({
		from: () => ({
			where: () => ({
				limit: () => Promise.resolve(state.userExists ? [{ id: 'u1' }] : []),
			}),
		}),
	});
	const update = () => ({
		set: (values: Record<string, unknown>) => ({
			where: () => ({
				returning: () => Promise.resolve(state.userExists ? [{ id: 'u1', ...values }] : []),
			}),
		}),
	});
	return { db: { select, update } };
});

import { actions as forgotActions } from '../src/routes/forgot-password/+page.server';
import { actions as resetActions, load as resetLoad } from '../src/routes/reset-password/+page.server';

const ORIGIN = 'https://app.example.test';

function formEvent(fields: Record<string, string>, extra: Record<string, unknown> = {}) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	return {
		request: { formData: async () => data },
		url: new URL(ORIGIN),
		getClientAddress: () => '203.0.113.7',
		cookies: { delete: (name: string) => deletedCookies.push(name) },
		...extra,
	} as never;
}

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
	logAuthEventMock.mockClear();
	createVerificationTokenMock.mockClear().mockResolvedValue('tok123');
	consumeVerificationTokenMock.mockReset().mockResolvedValue(true);
	sendEmailMock.mockClear();
	state.userExists = true;
	updatedRows.length = 0;
	deletedCookies.length = 0;
});

describe('/forgot-password', () => {
	it('rejects an empty email', async () => {
		const result = await forgotActions.default(formEvent({ email: '' }));
		expect(result).toMatchObject({ status: 422, data: { error: 'missing' } });
	});

	it('sends a reset link when the account exists', async () => {
		const result = await forgotActions.default(formEvent({ email: ' Chef@Example.com ' }));
		expect(createVerificationTokenMock).toHaveBeenCalledWith('reset-password:chef@example.com');
		expect(sendEmailMock).toHaveBeenCalledOnce();
		expect(result).toEqual({ sent: true });
	});

	it('answers "sent" even when the account does not exist, so accounts cannot be enumerated', async () => {
		state.userExists = false;
		const result = await forgotActions.default(formEvent({ email: 'ghost@example.com' }));
		expect(result).toEqual({ sent: true });
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('rate limits per IP and per email', async () => {
		rateLimitMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const result = await forgotActions.default(formEvent({ email: 'chef@example.com' }));
		expect(result).toMatchObject({ status: 429, data: { error: 'rate_limited' } });
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(rateLimitMock.mock.calls.map(c => c[0])).toEqual([
			'recover:ip:203.0.113.7',
			'recover:email:chef@example.com',
		]);
	});
});

describe('/reset-password', () => {
	it('reports whether the link carries a valid-looking token', async () => {
		expect(await resetLoad({ url: new URL(ORIGIN) } as never)).toEqual({ email: '', token: '', hasToken: false });
		expect(await resetLoad({ url: new URL(`${ORIGIN}?email=chef@example.com&token=abc`) } as never))
			.toEqual({ email: 'chef@example.com', token: 'abc', hasToken: true });
	});

	it('refuses without email/token', async () => {
		const result = await resetActions.default(formEvent({ password: 'longenough1', confirm: 'longenough1' }));
		expect(result).toMatchObject({ status: 400, data: { error: 'expired' } });
	});

	it('rejects a password shorter than 8 characters', async () => {
		const result = await resetActions.default(
			formEvent({ email: 'chef@example.com', token: 'abc', password: 'short', confirm: 'short' }),
		);
		expect(result).toMatchObject({ status: 422, data: { error: 'tooShort' } });
	});

	it('rejects a mismatched confirmation', async () => {
		const result = await resetActions.default(
			formEvent({ email: 'chef@example.com', token: 'abc', password: 'longenough1', confirm: 'longenough2' }),
		);
		expect(result).toMatchObject({ status: 422, data: { error: 'mismatch' } });
	});

	it('rejects an invalid or expired token', async () => {
		consumeVerificationTokenMock.mockResolvedValue(false);
		const result = await resetActions.default(
			formEvent({ email: 'chef@example.com', token: 'abc', password: 'longenough1', confirm: 'longenough1' }),
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'expired' } });
	});

	it('updates the password, clears the session cookie, and sends the user back to sign in', async () => {
		const thrown = await Promise.resolve(
			resetActions.default(
				formEvent({ email: 'chef@example.com', token: 'abc', password: 'longenough1', confirm: 'longenough1' }),
			),
		).catch((e: unknown) => e);

		expect(consumeVerificationTokenMock).toHaveBeenCalledWith('reset-password:chef@example.com', 'abc');
		expect(deletedCookies).toEqual(['authjs.session-token', '__Secure-authjs.session-token']);
		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { status: number; location: string }).status).toBe(303);
		expect((thrown as { status: number; location: string }).location).toBe('/login?reset=1');
		expect(logAuthEventMock).toHaveBeenCalledWith('password_reset_completed', expect.anything());
	});
});
