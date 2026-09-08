/**
 * Sentry API base URL (issue #506) — the region was hardcoded to EU
 * (de.sentry.io), so a US-region org's SENTRY_AUTH_TOKEN + SENTRY_ORG passed
 * isSentryConfigured() but every /admin/errors + /admin/health call 401/404'd.
 * The default stays EU (this deployment's org lives there); SENTRY_API_BASE_URL
 * makes it overridable for other regions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SENTRY_API_BASE_URL (env.ts)', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it.each([
		['defaults to the EU region when unset', undefined, 'https://de.sentry.io/api/0'],
		['falls back to the EU region when set to an empty string (e.g. a blank .env.example line)', '', 'https://de.sentry.io/api/0'],
		['respects an override for a non-EU region', 'https://sentry.io/api/0', 'https://sentry.io/api/0'],
		['strips a trailing slash so path concatenation never double-slashes', 'https://sentry.io/api/0/', 'https://sentry.io/api/0'],
	])('%s', async (_label, envValue, expected) => {
		vi.resetModules();
		vi.stubEnv('SENTRY_API_BASE_URL', envValue);
		const { SENTRY_API_BASE_URL } = await import('../src/lib/server/env');
		expect(SENTRY_API_BASE_URL).toBe(expected);
	});
});

describe('sentry-api fetches against the configured base URL', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		vi.resetModules();
		fetchMock.mockReset();
		fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.doUnmock('../src/lib/server/env');
		vi.resetModules();
	});

	it('uses the EU default when no override is configured', async () => {
		vi.doMock('../src/lib/server/env', () => ({
			SENTRY_API_BASE_URL: 'https://de.sentry.io/api/0',
			SENTRY_AUTH_TOKEN: 'test-token',
			SENTRY_ORG: 'my-org',
		}));
		const { listUnresolvedIssues } = await import('../src/lib/server/sentry-api');

		await listUnresolvedIssues(10);

		const [url] = fetchMock.mock.calls[0]!;
		expect(url).toBe(
			'https://de.sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',
		);
	});

	it('hits the overridden region when SENTRY_API_BASE_URL is set', async () => {
		vi.doMock('../src/lib/server/env', () => ({
			SENTRY_API_BASE_URL: 'https://sentry.io/api/0',
			SENTRY_AUTH_TOKEN: 'test-token',
			SENTRY_ORG: 'my-org',
		}));
		const { listUnresolvedIssues } = await import('../src/lib/server/sentry-api');

		await listUnresolvedIssues(10);

		const [url] = fetchMock.mock.calls[0]!;
		expect(url).toBe(
			'https://sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',
		);
	});
});
