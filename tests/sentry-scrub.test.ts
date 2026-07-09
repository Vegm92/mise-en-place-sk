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
});
