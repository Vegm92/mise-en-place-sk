/**
 * publicFormAction wrapper (issue #391, short-circuit fix issue #510).
 *
 * The public form routes used to reimplement honeypot + rate limiting per
 * route. These tests pin the shared behaviour: the honeypot short-circuits
 * before any limiter is touched, rules are checked IP-scope first regardless
 * of the order the caller lists them in, evaluation stops at the first rule
 * that fails so a later (e.g. identity-scoped) bucket is never consumed, and
 * the rule that actually tripped decides the scope reported to auth
 * telemetry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as v from 'valibot';

const { rateLimitMock, logAuthEventMock } = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
	logAuthEventMock: vi.fn(),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/auth-events', () => ({
	logAuthEvent: logAuthEventMock,
	hashIp: () => 'iphash',
}));

import { publicFormAction, formToRecord, parseForm } from '../src/lib/server/public-form-action';
import { fileFormData, formDataEvent, maliciousFile } from './helpers/form-data';

const EVENT_BASE = { url: new URL('https://app.example.test'), getClientAddress: () => '203.0.113.7' };

function formEvent(fields: Record<string, string>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	return formDataEvent(data, EVENT_BASE) as never;
}

function formEventWithFile(fields: Record<string, string | File>) {
	return formDataEvent(fileFormData(fields), EVENT_BASE) as never;
}

beforeEach(() => {
	rateLimitMock.mockReset().mockResolvedValue(true);
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

	it('short-circuits on the first failing rule and never touches the email bucket', async () => {
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
		expect(rateLimitMock.mock.calls.map(c => c[0])).toEqual(['login:ip:203.0.113.7']);
		expect(rateLimitMock).not.toHaveBeenCalledWith('login:email:chef@example.com', expect.anything());
		expect(logAuthEventMock).toHaveBeenCalledWith('login_rate_limited', {
			ipHash: 'iphash',
			scope: 'ip',
		});
	});

	it('checks the IP-scoped rule before the identity-scoped one even when the caller lists it second', async () => {
		rateLimitMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const action = publicFormAction(
			{
				rateLimitEvent: 'login_rate_limited',
				limits: () => [
					{ key: 'email-bucket', max: 1, scope: 'email' },
					{ key: 'ip-bucket', max: 1, scope: 'ip' },
				],
			},
			async () => ({ ok: true }),
		);

		expect(await action(formEvent({}))).toMatchObject({ status: 429 });
		expect(rateLimitMock.mock.calls.map(c => c[0])).toEqual(['ip-bucket']);
		expect(rateLimitMock).not.toHaveBeenCalledWith('email-bucket', expect.anything());
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
		expect(rateLimitMock.mock.calls.map(c => c[0])).toEqual(['a', 'b']);
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

describe('publicFormAction — schema option (issue #844)', () => {
	const Schema = v.object({ email: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase())) });

	it('passes the parsed, typed output to the handler as `data`', async () => {
		const action = publicFormAction({ schema: Schema }, async ({ data }) => data);
		expect(await action(formEvent({ email: ' Chef@Example.com ' }))).toEqual({ email: 'chef@example.com' });
	});

	it.each([
		{
			name: 'rejects a File posted under a string field with a 422 instead of throwing (issue #844)',
			arrange: () => {},
			options: { schema: Schema },
			status: 422,
			error: 'invalid',
		},
		{
			name: 'still runs rate limiting before the schema is parsed, then rejects the File',
			arrange: () => rateLimitMock.mockResolvedValueOnce(false),
			options: { limits: ({ ip }: { ip: string }) => [{ key: `x:${ip}`, max: 5 }], schema: Schema },
			status: 429,
			error: 'rate_limited',
		},
	])('$name', async ({ arrange, options, status, error }) => {
		arrange();
		const handler = vi.fn();
		const action = publicFormAction(options, handler);

		const result = await action(formEventWithFile({ email: maliciousFile() }));

		expect(result).toMatchObject({ status, data: { error } });
		expect(handler).not.toHaveBeenCalled();
	});
});

describe('formToRecord (issue #844)', () => {
	it('keeps the first value for a repeated field name, matching FormData.get()', () => {
		const data = new FormData();
		data.append('email', 'first@example.com');
		data.append('email', 'second@example.com');
		expect(formToRecord(data)).toEqual({ email: 'first@example.com' });
		expect(data.get('email')).toBe('first@example.com');
	});

	it('omits keys with no value and never coerces a File to a string', () => {
		const file = maliciousFile();
		const record = formToRecord(fileFormData({ upload: file }));
		expect(record.upload).toBe(file);
	});
});

describe('parseForm (issue #844)', () => {
	it('fails validation instead of throwing when a string field receives a File', () => {
		const Schema = v.object({ email: v.string() });
		const result = parseForm(Schema, fileFormData({ email: maliciousFile() }));
		expect(result.success).toBe(false);
	});
});
