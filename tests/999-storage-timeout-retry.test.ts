/**
 * Issue #999 — object storage was the only one of the audit's eleven outbound
 * hops with no timeout, no retry and no circuit breaker: Gemini has a 120 s
 * timeout and 3 retries, Postgres a 15 s statement timeout, storage nothing.
 * A hung read therefore blocked an extraction until pg-boss's 600 s
 * `expireInSeconds` fired.
 *
 * `withStorageRetry` is what every `RailwayBucketDriver` call now goes
 * through: each attempt is bounded by `STORAGE_TIMEOUT_MS` and aborted through
 * the signal handed to the S3 client, and only transient failures are retried
 * — a missing key or a permission error must fail on the first attempt rather
 * than three times slower.
 *
 * The S3 client's own `maxAttempts` is pinned to 1 in storage.ts so the SDK's
 * default retry policy does not multiply with this one.
 */
import { describe, it, expect, vi } from 'vitest';
import { withStorageRetry, isTransientStorageError } from '../src/lib/server/storage';
import { TimeoutError } from '../src/lib/server/with-timeout';

function s3Error(name: string, httpStatusCode?: number): Error {
	const err = new Error(name);
	err.name = name;
	if (httpStatusCode !== undefined) {
		(err as unknown as { $metadata: { httpStatusCode: number } }).$metadata = { httpStatusCode };
	}
	return err;
}

describe('isTransientStorageError', () => {
	it('treats 5xx, 429 and network/timeout failures as transient', () => {
		expect(isTransientStorageError(s3Error('InternalError', 500))).toBe(true);
		expect(isTransientStorageError(s3Error('SlowDown', 503))).toBe(true);
		expect(isTransientStorageError(s3Error('Throttling', 429))).toBe(true);
		expect(isTransientStorageError(s3Error('ECONNRESET'))).toBe(true);
		expect(isTransientStorageError(new TimeoutError('storage.read k', 10))).toBe(true);
	});

	it('does not treat a missing key or a permission error as transient', () => {
		expect(isTransientStorageError(s3Error('NoSuchKey', 404))).toBe(false);
		expect(isTransientStorageError(s3Error('AccessDenied', 403))).toBe(false);
		expect(isTransientStorageError(s3Error('InvalidRequest', 400))).toBe(false);
	});
});

describe('withStorageRetry', () => {
	it('retries a transient failure and returns the later success', async () => {
		const fn = vi.fn()
			.mockRejectedValueOnce(s3Error('InternalError', 500))
			.mockResolvedValueOnce(Buffer.from('ok'));
		const out = await withStorageRetry<Buffer>('storage.read k', fn, 3, 1000);
		expect(fn).toHaveBeenCalledTimes(2);
		expect(out.toString()).toBe('ok');
	});

	it('does not retry a non-transient failure', async () => {
		const fn = vi.fn().mockRejectedValue(s3Error('NoSuchKey', 404));
		await expect(withStorageRetry('storage.read k', fn, 3, 1000)).rejects.toThrow('NoSuchKey');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('gives up after the attempt budget and rethrows the last error', async () => {
		const fn = vi.fn().mockRejectedValue(s3Error('InternalError', 500));
		await expect(withStorageRetry('storage.save k', fn, 2, 1000)).rejects.toThrow('InternalError');
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('bounds a hanging call instead of waiting forever, and aborts its signal', async () => {
		const aborted: boolean[] = [];
		const fn = vi.fn((signal: AbortSignal) => new Promise((_, reject) => {
			signal.addEventListener('abort', () => {
				aborted.push(true);
				reject(signal.reason);
			});
		}));
		await expect(withStorageRetry('storage.read hung', fn, 1, 20)).rejects.toBeInstanceOf(TimeoutError);
		expect(aborted).toEqual([true]);
	});

	it('retries a timed-out attempt within the budget', async () => {
		let call = 0;
		const fn = vi.fn((signal: AbortSignal) => {
			call += 1;
			if (call === 1) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
			return Promise.resolve('recovered');
		});
		await expect(withStorageRetry('storage.read slow', fn, 2, 20)).resolves.toBe('recovered');
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
