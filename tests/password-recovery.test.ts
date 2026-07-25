/**
 * Password recovery routes (issue #284).
 *
 * /forgot-password must be an account-enumeration dead end: the same answer
 * whether or not the address exists, and rate limited per IP and per email.
 * /reset-password must refuse without a recovery session, enforce the password
 * rules, and end the session so the new password is actually exercised.
 *
 * Supabase, the rate limiter and auth telemetry are mocked — this isolates the
 * action logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

const { rateLimitMock, logAuthEventMock } = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
	logAuthEventMock: vi.fn(),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/auth-events', () => ({
	logAuthEvent: logAuthEventMock,
	hashIp: () => 'iphash',
}));

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
		...extra,
	} as never;
}

function supabaseStub(overrides: Record<string, unknown> = {}) {
	return {
		auth: {
			resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
			updateUser: vi.fn().mockResolvedValue({ error: null }),
			signOut: vi.fn().mockResolvedValue({ error: null }),
			...overrides,
		},
	};
}

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
	logAuthEventMock.mockClear();
});

describe('/forgot-password', () => {
	it('rejects an empty email', async () => {
		const result = await forgotActions.default(formEvent({ email: '' }, { locals: { supabase: supabaseStub() } }));
		expect(result).toMatchObject({ status: 422, data: { error: 'missing' } });
	});

	it('sends a recovery link pointing at the callback → /reset-password', async () => {
		const supabase = supabaseStub();
		const result = await forgotActions.default(
			formEvent({ email: ' Chef@Example.com ' }, { locals: { supabase } }),
		);
		expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('Chef@Example.com', {
			redirectTo: `${ORIGIN}/auth/callback?next=/reset-password`,
		});
		expect(result).toEqual({ sent: true });
	});

	it('answers "sent" even when Supabase errors, so accounts cannot be enumerated', async () => {
		const supabase = supabaseStub({
			resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { message: 'User not found' } }),
		});
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = await forgotActions.default(formEvent({ email: 'ghost@example.com' }, { locals: { supabase } }));
		expect(result).toEqual({ sent: true });
		spy.mockRestore();
	});

	it('rate limits per IP and per email', async () => {
		const supabase = supabaseStub();
		rateLimitMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const result = await forgotActions.default(formEvent({ email: 'chef@example.com' }, { locals: { supabase } }));
		expect(result).toMatchObject({ status: 429, data: { error: 'rate_limited' } });
		expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
		expect(rateLimitMock.mock.calls.map(c => c[0])).toEqual([
			'recover:ip:203.0.113.7',
			'recover:email:chef@example.com',
		]);
	});
});

describe('/reset-password', () => {
	it('reports a missing recovery session to the page', async () => {
		expect(await resetLoad({ locals: { user: null } } as never)).toEqual({ hasRecoverySession: false });
		expect(await resetLoad({ locals: { user: { id: 'u1' } } } as never)).toEqual({ hasRecoverySession: true });
	});

	it('refuses without a recovery session', async () => {
		const result = await resetActions.default(
			formEvent({ password: 'longenough1', confirm: 'longenough1' }, { locals: { user: null, supabase: supabaseStub() } }),
		);
		expect(result).toMatchObject({ status: 401, data: { error: 'expired' } });
	});

	it('rejects a password shorter than 8 characters', async () => {
		const result = await resetActions.default(
			formEvent({ password: 'short', confirm: 'short' }, { locals: { user: { id: 'u1' }, supabase: supabaseStub() } }),
		);
		expect(result).toMatchObject({ status: 422, data: { error: 'tooShort' } });
	});

	it('rejects a mismatched confirmation', async () => {
		const result = await resetActions.default(
			formEvent({ password: 'longenough1', confirm: 'longenough2' }, { locals: { user: { id: 'u1' }, supabase: supabaseStub() } }),
		);
		expect(result).toMatchObject({ status: 422, data: { error: 'mismatch' } });
	});

	it('surfaces a Supabase rejection as a form error', async () => {
		const supabase = supabaseStub({ updateUser: vi.fn().mockResolvedValue({ error: { message: 'same as old' } }) });
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = await resetActions.default(
			formEvent({ password: 'longenough1', confirm: 'longenough1' }, { locals: { user: { id: 'u1' }, supabase } }),
		);
		expect(result).toMatchObject({ status: 400, data: { error: 'failed' } });
		expect(supabase.auth.signOut).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it('updates the password, signs out, and sends the user back to sign in', async () => {
		const supabase = supabaseStub();
		const thrown = await resetActions
			.default(formEvent({ password: 'longenough1', confirm: 'longenough1' }, { locals: { user: { id: 'u1' }, supabase } }))
			.catch((e: unknown) => e);

		expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'longenough1' });
		expect(supabase.auth.signOut).toHaveBeenCalled();
		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { status: number; location: string }).status).toBe(303);
		expect((thrown as { status: number; location: string }).location).toBe('/login?reset=1');
		expect(logAuthEventMock).toHaveBeenCalledWith('password_reset_completed', expect.anything());
	});
});
