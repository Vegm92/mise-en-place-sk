/**
 * Rate limiter — configured-but-failing backend (issue #1072).
 *
 * tests/rate-limiter.test.ts covers the unconfigured state (no UPSTASH_* env,
 * in-process token bucket). This file mocks the env module so Upstash is
 * *configured* and mocks the client so every call fails, then pins the three
 * outcomes: an auth-critical limit in production denies (throws), the same
 * limit in development degrades to the in-process bucket, and a
 * non-critical limit degrades in production too (a throughput cap is not a
 * security control — failing it closed would turn a Redis blip into an
 * outage of every authenticated endpoint).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

vi.mock('$lib/server/env', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/lib/server/env')>()),
	UPSTASH_REDIS_REST_URL: 'https://upstash.example.test',
	UPSTASH_REDIS_REST_TOKEN: 'token',
}));
vi.mock('@upstash/redis', () => ({
	Redis: class { ping() { return Promise.resolve('PONG'); } },
}));
vi.mock('@upstash/ratelimit', () => ({
	Ratelimit: class {
		static slidingWindow() { return {}; }
		limit(key: string) { return limitMock(key); }
	},
}));

const { checkRateLimit, RateLimitBackendUnavailableError } = await import('../src/lib/server/rate-limiter');

beforeEach(() => {
	limitMock.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('checkRateLimit — Upstash configured and healthy', () => {
	it('returns the backend verdict and never consults the in-process bucket', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const key = `healthy-${randomUUID()}`;
		limitMock.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
		expect(await checkRateLimit(key, 1, undefined, { authCritical: true })).toBe(true);
		expect(await checkRateLimit(key, 1, undefined, { authCritical: true })).toBe(false);
		expect(limitMock).toHaveBeenCalledTimes(2);
		expect(limitMock).toHaveBeenCalledWith(key);
	});
});

describe('checkRateLimit — Upstash configured but failing', () => {
	beforeEach(() => {
		limitMock.mockRejectedValue(new Error('ECONNRESET upstash'));
	});

	it('denies an auth-critical limit in production by throwing RateLimitBackendUnavailableError', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		await expect(checkRateLimit(`critical-${randomUUID()}`, 5, undefined, { authCritical: true }))
			.rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
	});

	it('keeps denying on every attempt while the backend stays down — no per-process budget is ever minted', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const key = `critical-repeat-${randomUUID()}`;
		for (let i = 0; i < 3; i++) {
			await expect(checkRateLimit(key, 100, undefined, { authCritical: true }))
				.rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
		}
	});

	it('degrades a non-critical limit in production to the in-process bucket', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const key = `noncritical-${randomUUID()}`;
		expect(await checkRateLimit(key, 2)).toBe(true);
		expect(await checkRateLimit(key, 2)).toBe(true);
		expect(await checkRateLimit(key, 2)).toBe(false);
	});

	it('degrades an auth-critical limit to the in-process bucket outside production', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const key = `critical-dev-${randomUUID()}`;
		expect(await checkRateLimit(key, 1, undefined, { authCritical: true })).toBe(true);
		expect(await checkRateLimit(key, 1, undefined, { authCritical: true })).toBe(false);
	});

	it('does not leak the rate-limit key (an IP or email) into the error message', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const key = `login:email:chef-${randomUUID()}@example.com`;
		const err = await checkRateLimit(key, 5, undefined, { authCritical: true }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(RateLimitBackendUnavailableError);
		expect(String((err as Error).message)).not.toContain(key);
	});
});

describe('auth-critical call sites carry the flag (source scan)', () => {
	// The limits that stop credential attacks or abuse of unauthenticated
	// entry points: login/signup/recover/waitlist (via publicFormAction),
	// verification resend, email change, WhatsApp pairing-code redemption.
	it.each([
		'src/lib/server/public-form-action.ts',
		'src/lib/server/resend-verification-action.ts',
		'src/routes/(app)/settings/+page.server.ts',
		'src/lib/server/whatsapp-pairing.ts',
	])('%s passes authCritical: true and maps RateLimitBackendUnavailableError to a denial', (relFile) => {
		const src = fs.readFileSync(path.join(process.cwd(), relFile), 'utf8');
		expect(src).toContain('authCritical: true');
		expect(src).toContain('instanceof RateLimitBackendUnavailableError');
	});
});
