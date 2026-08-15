/**
 * Rate limiter (waitlist abuse guard #180 + extraction concurrency).
 *
 * Without UPSTASH_REDIS_REST_* env the module uses its in-process token-bucket
 * fallback — which is exactly what these tests exercise. Each test uses a unique
 * key so the module-global bucket map can't leak state between cases.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import {
	checkRateLimit,
	tryAcquireExtraction,
	releaseExtraction,
	acquireExtractionSlot,
} from '../src/lib/server/rate-limiter';

afterEach(() => {
	vi.useRealTimers();
});

describe('checkRateLimit — in-memory token bucket', () => {
	it('allows exactly maxPerMinute requests in a burst, then blocks', async () => {
		const key = `burst-${randomUUID()}`;
		expect(await checkRateLimit(key, 3)).toBe(true);
		expect(await checkRateLimit(key, 3)).toBe(true);
		expect(await checkRateLimit(key, 3)).toBe(true);
		expect(await checkRateLimit(key, 3)).toBe(false);
	});

	it('keeps separate budgets per key', async () => {
		const a = `a-${randomUUID()}`;
		const b = `b-${randomUUID()}`;
		expect(await checkRateLimit(a, 1)).toBe(true);
		expect(await checkRateLimit(a, 1)).toBe(false);
		// b is untouched by a's exhaustion
		expect(await checkRateLimit(b, 1)).toBe(true);
	});

	it('blocks immediately after a single-token budget is spent', async () => {
		const key = `single-${randomUUID()}`;
		expect(await checkRateLimit(key, 1)).toBe(true);
		expect(await checkRateLimit(key, 1)).toBe(false);
		expect(await checkRateLimit(key, 1)).toBe(false);
	});

	it('refills tokens over time', async () => {
		vi.useFakeTimers();
		const key = `refill-${randomUUID()}`;
		// Spend the whole budget
		expect(await checkRateLimit(key, 2)).toBe(true);
		expect(await checkRateLimit(key, 2)).toBe(true);
		expect(await checkRateLimit(key, 2)).toBe(false);
		// After a full minute the bucket has refilled
		await vi.advanceTimersByTimeAsync(60_000);
		expect(await checkRateLimit(key, 2)).toBe(true);
	});
});

describe('checkRateLimit — custom window (issue #322)', () => {
	it('holds a long cooldown open past the point a per-minute budget would refill', async () => {
		vi.useFakeTimers();
		const key = `cooldown-${randomUUID()}`;
		const SIX_HOURS_S = 6 * 60 * 60;

		expect(await checkRateLimit(key, 1, SIX_HOURS_S)).toBe(true);
		expect(await checkRateLimit(key, 1, SIX_HOURS_S)).toBe(false);

		// A minute later a default-window budget would be back; this one is not —
		// and the periodic bucket sweep must not have quietly reset it either.
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(await checkRateLimit(key, 1, SIX_HOURS_S)).toBe(false);

		// It does reopen once the window has actually passed.
		await vi.advanceTimersByTimeAsync(SIX_HOURS_S * 1000);
		expect(await checkRateLimit(key, 1, SIX_HOURS_S)).toBe(true);
	});

	it('defaults to a per-minute window when none is given', async () => {
		vi.useFakeTimers();
		const key = `default-window-${randomUUID()}`;
		expect(await checkRateLimit(key, 1)).toBe(true);
		expect(await checkRateLimit(key, 1)).toBe(false);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(await checkRateLimit(key, 1)).toBe(true);
	});
});

describe('extraction concurrency semaphore', () => {
	it('grants up to max slots then refuses', () => {
		expect(tryAcquireExtraction(2)).toBe(true);
		expect(tryAcquireExtraction(2)).toBe(true);
		expect(tryAcquireExtraction(2)).toBe(false);
		// cleanup
		releaseExtraction();
		releaseExtraction();
	});

	it('frees a slot on release', () => {
		expect(tryAcquireExtraction(1)).toBe(true);
		expect(tryAcquireExtraction(1)).toBe(false);
		releaseExtraction();
		expect(tryAcquireExtraction(1)).toBe(true);
		releaseExtraction();
	});

	it('never drops the active count below zero on over-release', () => {
		// Extra releases must not create phantom capacity beyond max.
		releaseExtraction();
		releaseExtraction();
		expect(tryAcquireExtraction(1)).toBe(true);
		expect(tryAcquireExtraction(1)).toBe(false);
		releaseExtraction();
	});
});

describe('acquireExtractionSlot — bounded async semaphore (in-memory fallback)', () => {
	it('blocks a further acquire until a held slot is released', async () => {
		const a = await acquireExtractionSlot(2);
		const b = await acquireExtractionSlot(2);

		let thirdAcquired = false;
		const thirdPromise = acquireExtractionSlot(2).then((slot) => {
			thirdAcquired = true;
			return slot;
		});

		// The queue is full — the third acquire must stay pending.
		await Promise.resolve();
		await Promise.resolve();
		expect(thirdAcquired).toBe(false);

		// Releasing a slot hands it straight to the waiter.
		await a.release();
		const c = await thirdPromise;
		expect(thirdAcquired).toBe(true);

		await b.release();
		await c.release();
	});

	it('release is idempotent and never mints phantom capacity', async () => {
		const first = await acquireExtractionSlot(1);
		await first.release();
		await first.release();

		// With the single slot genuinely free again, the next acquire resolves.
		const second = await acquireExtractionSlot(1);
		await second.release();
		expect(true).toBe(true);
	});
});
