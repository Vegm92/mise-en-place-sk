/**
 * Issue #1072 — a configured-but-failing Upstash must not degrade to the
 * per-process in-memory bucket for auth-critical limits in production, while
 * availability-critical limits (api-global, health) must keep degrading rather
 * than take the API down with Redis (ADR-043). The module reads its Upstash
 * config at import time, so each case re-imports it with a mocked env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const upstash = vi.hoisted(() => ({ limit: vi.fn() }));

vi.mock('$lib/server/env', () => ({
	UPSTASH_REDIS_REST_URL: 'https://upstash.example.com',
	UPSTASH_REDIS_REST_TOKEN: 'token',
	MAX_CONCURRENT_EXTRACTIONS: 3,
	GEMINI_TIMEOUT_MS: 120000,
}));

vi.mock('@upstash/redis', () => ({
	Redis: class {
		ping() { return Promise.resolve('PONG'); }
	},
}));

vi.mock('@upstash/ratelimit', () => {
	class Ratelimit {
		static slidingWindow() { return {}; }
		limit(key: string) { return upstash.limit(key) as Promise<{ success: boolean }>; }
	}
	return { Ratelimit };
});

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

async function loadRateLimiter() {
	vi.resetModules();
	return import('../src/lib/server/rate-limiter');
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	upstash.limit.mockReset();
	process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('checkAuthRateLimit with Upstash configured', () => {
	it('denies in production when the Upstash call throws', async () => {
		process.env.NODE_ENV = 'production';
		upstash.limit.mockRejectedValue(new Error('ECONNREFUSED'));
		const { checkAuthRateLimit } = await loadRateLimiter();
		expect(await checkAuthRateLimit('login:ip:203.0.113.7', 5)).toBe(false);
		expect(await checkAuthRateLimit('login:ip:203.0.113.7', 5)).toBe(false);
	});

	it('falls back to the in-memory bucket outside production', async () => {
		process.env.NODE_ENV = 'development';
		upstash.limit.mockRejectedValue(new Error('ECONNREFUSED'));
		const { checkAuthRateLimit } = await loadRateLimiter();
		expect(await checkAuthRateLimit('dev:ip:203.0.113.7', 2)).toBe(true);
		expect(await checkAuthRateLimit('dev:ip:203.0.113.7', 2)).toBe(true);
		expect(await checkAuthRateLimit('dev:ip:203.0.113.7', 2)).toBe(false);
	});

	it('still honours a healthy Upstash verdict in production', async () => {
		process.env.NODE_ENV = 'production';
		upstash.limit.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
		const { checkAuthRateLimit } = await loadRateLimiter();
		expect(await checkAuthRateLimit('ok:ip:203.0.113.7', 5)).toBe(true);
		expect(await checkAuthRateLimit('ok:ip:203.0.113.7', 5)).toBe(false);
	});
});

describe('checkRateLimit stays available-first when Upstash fails', () => {
	it('keeps api-global on the in-memory bucket in production instead of 429ing the whole API', async () => {
		process.env.NODE_ENV = 'production';
		upstash.limit.mockRejectedValue(new Error('ECONNREFUSED'));
		const { checkRateLimit } = await loadRateLimiter();
		expect(await checkRateLimit('api-global:ip:203.0.113.7', 2)).toBe(true);
		expect(await checkRateLimit('api-global:ip:203.0.113.7', 2)).toBe(true);
		expect(await checkRateLimit('api-global:ip:203.0.113.7', 2)).toBe(false);
	});

	it('keeps the health endpoint answering in production so the platform does not restart-loop', async () => {
		process.env.NODE_ENV = 'production';
		upstash.limit.mockRejectedValue(new Error('ECONNREFUSED'));
		const { checkRateLimit } = await loadRateLimiter();
		expect(await checkRateLimit('health:203.0.113.7', 5)).toBe(true);
	});
});
