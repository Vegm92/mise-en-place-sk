/**
 * publicFormAction wrapper (issue #391).
 *
 * The public form routes used to reimplement honeypot + rate limiting per
 * route. These tests pin the shared behaviour: the honeypot short-circuits
 * before any limiter is touched, every configured rule is evaluated (the
 * per-IP and per-email caps are both consumed, matching the login and
 * password-recovery actions this replaced), and the blocked rule decides the
 * scope reported to auth telemetry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rateLimitMock, logAuthEventMock } = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
	logAuthEventMock: vi.fn(),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/auth-events', () => ({
	logAuthEvent: logAuthEventMock,
	hashIp: () => 'iphash',
}));

import { publicFormAction } from '../src/lib/server/public-form-action';

function formEvent(fields: Record<string, string>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	return {
		request: { formData: async () => data },
		url: new URL('https://app.example.test'),
		getClientAddress: () => '203.0.113.7',
	} as never;
}

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
	logAuthEventMock.mockClear();
});

describe('publicFormAction', () => {
	it('runs the handler with the parsed form when nothing blocks', async () => {
		const action = publicFormAction({}, async ({ form, ip, ipHash }) => ({
			email: form.get('email'),
			ip,
			ipHash,
		}));
		expect(await action(formEvent({ email: 'chef@example.com' }))).toEqual({
			email: 'chef@example.com',
			ip: '203.0.113.7',
			ipHash: 'iphash',
		});
	});

	it('rejects a filled honeypot before consuming any rate limit', async () => {
		const handler = vi.fn();
		const action = publicFormAction(
			{ limits: ({ ip }) => [{ key: `x:${ip}`, max: 5 }] },
			handler,
		);
		const result = await action(formEvent({ _hp: 'bot', email: 'chef@example.com' }));
		expect(result).toMatchObject({ status: 422, data: { error: 'invalid' } });
		expect(rateLimitMock).not.toHaveBeenCalled();
		expect(handler).not.toHaveBeenCalled();
	});

	it('evaluates every rule even after one fails, and reports the blocked scope', async () => {
		rateLimitMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const handler = vi.fn();
		const action = publicFormAction(
			{
				rateLimitEvent: 'login_rate_limited',
				failData: ({ form }) => ({ email: form.get('email') }),
				limits: ({ ip, form }) => [
					{ key: `login:ip:${ip}`, max: 10, scope: 'ip' },
					{ key: `login:email:${form.get('email')}`, max: 5, scope: 'email' },
				],
			},
			handler,
		);

		const result = await action(formEvent({ email: 'chef@example.com' }));

		expect(result).toMatchObject({
			status: 429,
			data: { error: 'rate_limited', email: 'chef@example.com' },
		});
		expect(handler).not.toHaveBeenCalled();
		expect(rateLimitMock.mock.calls.map(c => c[0])).toEqual([
			'login:ip:203.0.113.7',
			'login:email:chef@example.com',
		]);
		expect(logAuthEventMock).toHaveBeenCalledWith('login_rate_limited', {
			ipHash: 'iphash',
			scope: 'ip',
		});
	});

	it('attributes the block to the second rule when only that one trips', async () => {
		rateLimitMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		const action = publicFormAction(
			{
				rateLimitEvent: 'login_rate_limited',
				limits: () => [
					{ key: 'a', max: 1, scope: 'ip' },
					{ key: 'b', max: 1, scope: 'email' },
				],
			},
			async () => ({ ok: true }),
		);

		expect(await action(formEvent({}))).toMatchObject({ status: 429 });
		expect(logAuthEventMock).toHaveBeenCalledWith('login_rate_limited', {
			ipHash: 'iphash',
			scope: 'email',
		});
	});

	it('omits scope for single-limit routes and stays quiet without an event kind', async () => {
		rateLimitMock.mockResolvedValue(false);

		const logged = publicFormAction(
			{ rateLimitEvent: 'signup_rate_limited', limits: ({ ip }) => [{ key: `signup:ip:${ip}`, max: 5 }] },
			async () => ({ ok: true }),
		);
		expect(await logged(formEvent({}))).toMatchObject({ status: 429, data: { error: 'rate_limited' } });
		expect(logAuthEventMock).toHaveBeenCalledWith('signup_rate_limited', { ipHash: 'iphash' });

		logAuthEventMock.mockClear();
		const silent = publicFormAction(
			{ limits: ({ ip }) => [{ key: `waitlist:${ip}`, max: 5 }] },
			async () => ({ ok: true }),
		);
		expect(await silent(formEvent({}))).toMatchObject({ status: 429 });
		expect(logAuthEventMock).not.toHaveBeenCalled();
	});
});
