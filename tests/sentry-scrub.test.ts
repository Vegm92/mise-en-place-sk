/**
 * Sentry PII scrubbing (issue #254) — the shared beforeSend redactor must
 * strip live OAuth codes, tokens, and emails from request URLs before an
 * event leaves the process, while leaving benign URLs untouched.
 */
import { describe, it, expect } from 'vitest';
import { scrubUrl, scrubSentryEvent } from '../src/lib/sentry-scrub';

describe('scrubUrl', () => {
	it('redacts an OAuth code on an absolute callback URL', () => {
		const out = scrubUrl('https://app.example.com/auth/callback?code=live-secret&next=/onboarding');
		expect(out).not.toContain('live-secret');
		expect(out).toContain('code=%5Bredacted%5D');
		expect(out).toContain('next=%2Fonboarding');
	});

	it('redacts token and email on a relative URL and keeps the path', () => {
		const out = scrubUrl('/reset?token=abc123&email=user@example.com');
		expect(out).toContain('/reset');
		expect(out).not.toContain('abc123');
		expect(out).not.toContain('user@example.com');
	});

	it('leaves a URL with no sensitive params unchanged', () => {
		const url = 'https://app.example.com/dashboard?month=2026-07';
		expect(scrubUrl(url)).toBe(url);
	});
});

describe('scrubSentryEvent', () => {
	it('scrubs the request URL in place', () => {
		const event = { request: { url: 'https://app.example.com/auth/callback?code=xyz' } };
		const out = scrubSentryEvent(event);
		expect(out.request.url).not.toContain('xyz');
	});

	it('is a no-op when there is no request URL', () => {
		const event: { message: string; request?: { url?: string } } = { message: 'boom' };
		expect(scrubSentryEvent(event)).toBe(event);
	});

	it('redacts a secret-bearing object nested in event.extra', () => {
		const event = {
			extra: {
				upstreamError: {
					request: {
						url: 'https://app.example.com/auth/callback?code=live-secret',
						headers: {
							Authorization: 'Bearer live-jwt',
							Cookie: 'session=abc123',
							'X-Request-Id': 'req-1',
						},
					},
					token: 'raw-token-value',
				},
			},
		};
		const out = scrubSentryEvent(event);
		const nested = out.extra.upstreamError as {
			request: { url: string; headers: Record<string, string> };
			token: string;
		};
		expect(nested.request.url).not.toContain('live-secret');
		expect(nested.request.url).toContain('code=%5Bredacted%5D');
		expect(nested.request.headers['Authorization']).toBe('[redacted]');
		expect(nested.request.headers['Cookie']).toBe('[redacted]');
		expect(nested.request.headers['X-Request-Id']).toBe('req-1');
		expect(nested.token).toBe('[redacted]');
	});

	it('guards the extra deep-walk against cycles', () => {
		const cyclic: Record<string, unknown> = { token: 'secret-value' };
		cyclic['self'] = cyclic;
		const event = { extra: { cyclic } };
		expect(() => scrubSentryEvent(event)).not.toThrow();
		expect((event.extra.cyclic as Record<string, unknown>)['token']).toBe('[redacted]');
	});

	it('redacts a token URL on an http breadcrumb', () => {
		const event = {
			breadcrumbs: [
				{
					category: 'fetch',
					type: 'http',
					data: { url: 'https://app.example.com/reset?token=abc123&next=/x', method: 'GET' },
				},
			],
		};
		const out = scrubSentryEvent(event);
		const data = out.breadcrumbs[0].data as { url: string; method: string };
		expect(data.url).not.toContain('abc123');
		expect(data.method).toBe('GET');
	});

	it('redacts sensitive query params embedded in a breadcrumb message string', () => {
		const event = {
			breadcrumbs: [
				{ message: 'Fetch failed for https://app.example.com/auth/callback?code=live-secret&next=/x' },
			],
		};
		const out = scrubSentryEvent(event);
		expect(out.breadcrumbs[0].message).not.toContain('live-secret');
		expect(out.breadcrumbs[0].message).toContain('code=%5Bredacted%5D');
	});

	it('drops authorization and cookie headers from request.headers', () => {
		const event = {
			request: {
				headers: { authorization: 'Bearer live-jwt', 'user-agent': 'vitest' },
			},
		};
		const out = scrubSentryEvent(event);
		expect(out.request.headers.authorization).toBe('[redacted]');
		expect(out.request.headers['user-agent']).toBe('vitest');
	});

	it('redacts all values in request.cookies', () => {
		const event = {
			request: {
				cookies: { session: 'live-session-id', theme: 'dark' },
			},
		};
		const out = scrubSentryEvent(event);
		expect(out.request.cookies.session).toBe('[redacted]');
		expect(out.request.cookies.theme).toBe('[redacted]');
	});
});
