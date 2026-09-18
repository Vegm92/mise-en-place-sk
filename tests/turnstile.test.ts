import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstileToken } from '../src/lib/server/turnstile';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
	vi.restoreAllMocks();
	process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

const okResponse = (success: boolean) =>
	({ ok: true, json: async () => ({ success }) }) as Response;

describe('verifyTurnstileToken', () => {
	it('is a no-op when no secret is configured', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await expect(verifyTurnstileToken('anything', '203.0.113.7', '')).resolves.toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rejects a missing token when a secret is configured', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await expect(verifyTurnstileToken('', '203.0.113.7', 'secret')).resolves.toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('accepts a token that siteverify confirms', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(true));
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(true);
	});

	it('rejects a token that siteverify denies', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(false));
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(false);
	});

	it('fails open outside production when siteverify is unreachable', async () => {
		process.env.NODE_ENV = 'development';
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(true);
	});

	it('fails open outside production on a non-200 siteverify response', async () => {
		process.env.NODE_ENV = 'development';
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(true);
	});

	it('fails closed in production when siteverify is unreachable (issue #1072)', async () => {
		process.env.NODE_ENV = 'production';
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(false);
	});

	it('fails closed in production on a non-200 siteverify response (issue #1072)', async () => {
		process.env.NODE_ENV = 'production';
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(false);
	});

	it('retries once before giving up, and accepts a token the retry confirms', async () => {
		process.env.NODE_ENV = 'production';
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetchSpy = vi.spyOn(globalThis, 'fetch')
			.mockRejectedValueOnce(new Error('ENOTFOUND'))
			.mockResolvedValueOnce(okResponse(true));
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
});
