/**
 * Turnstile siteverify client (issue #1072).
 *
 * The result is a tri-state outcome rather than a boolean so the caller can
 * tell "the challenge said no" from "the challenge could not be asked" — the
 * pre-#1072 client collapsed the latter into `true`, which switched bot
 * protection off whenever challenges.cloudflare.com was unreachable or
 * rate-limiting this server. Whether `unavailable` denies is the caller's
 * decision (publicFormAction: deny in production, allow in development).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstileToken } from '../src/lib/server/turnstile';

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

const okResponse = (success: boolean) =>
	({ ok: true, json: async () => ({ success }) }) as Response;

function silenceConsole() {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
}

// The client sleeps between attempts; drive the clock so the retry path
// runs without a real 300 ms wait per test.
async function verifyWithRetries(token = 'tok') {
	vi.useFakeTimers();
	const pending = verifyTurnstileToken(token, '203.0.113.7', 'secret');
	await vi.advanceTimersByTimeAsync(1000);
	return pending;
}

describe('verifyTurnstileToken', () => {
	it('is verified without a call when no secret is configured (feature off)', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await expect(verifyTurnstileToken('anything', '203.0.113.7', '')).resolves.toBe('verified');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rejects a missing token when a secret is configured', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await expect(verifyTurnstileToken('', '203.0.113.7', 'secret')).resolves.toBe('rejected');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('is verified when siteverify confirms the token', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(true));
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe('verified');
	});

	it('is rejected when siteverify denies the token, with no retry', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(false));
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe('rejected');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('retries once and is verified when the first attempt was a network error', async () => {
		silenceConsole();
		const fetchSpy = vi.spyOn(globalThis, 'fetch')
			.mockRejectedValueOnce(new Error('ENOTFOUND'))
			.mockResolvedValueOnce(okResponse(true));
		await expect(verifyWithRetries()).resolves.toBe('verified');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it('is unavailable — never verified — when siteverify is unreachable on both attempts', async () => {
		silenceConsole();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
		await expect(verifyWithRetries()).resolves.toBe('unavailable');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it('is unavailable on a persistent non-2xx siteverify response', async () => {
		silenceConsole();
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
		await expect(verifyWithRetries()).resolves.toBe('unavailable');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it('treats a malformed siteverify body as unavailable, not as verified', async () => {
		silenceConsole();
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('bad json'); } } as unknown as Response);
		await expect(verifyWithRetries()).resolves.toBe('unavailable');
	});
});
