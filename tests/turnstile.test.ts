import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstileToken } from '../src/lib/server/turnstile';

afterEach(() => vi.restoreAllMocks());

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

	it('fails open when siteverify is unreachable', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(true);
	});

	it('fails open on a non-200 siteverify response', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
		await expect(verifyTurnstileToken('tok', '203.0.113.7', 'secret')).resolves.toBe(true);
	});
});
