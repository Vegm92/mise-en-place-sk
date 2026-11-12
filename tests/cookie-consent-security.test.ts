import { describe, it, expect, vi } from 'vitest';
import { writeConsent } from '$lib/server/cookie-consent';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { POST } from '../src/routes/cookie-consent/+server';

vi.mock('$lib/server/cookie-consent', () => ({
	writeConsent: vi.fn(),
}));

vi.mock('$lib/server/rate-limiter', () => ({
	checkRateLimit: vi.fn().mockResolvedValue(true),
}));

function postEvent(choice: string, next?: string, accept = 'text/html') {
	const formData = new FormData();
	formData.append('choice', choice);
	if (next !== undefined) formData.append('next', next);
	return {
		request: { formData: vi.fn().mockResolvedValue(formData), headers: new Headers({ accept }) },
		cookies: {},
		getClientAddress: () => '127.0.0.1',
	} as any;
}

describe('POST /cookie-consent security', () => {
	it('rejects invalid choice values with 400', async () => {
		await expect(POST(postEvent('invalid_choice'))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid choice value' },
		});
	});

	it('accepts valid choices and sanitizes next path', async () => {
		await expect(POST(postEvent('granted', '/dashboard'))).rejects.toMatchObject({
			status: 303,
			location: '/dashboard',
		});
		await expect(POST(postEvent('granted', '\\evil.com'))).rejects.toMatchObject({
			status: 303,
			location: '/',
		});
	});

	it('answers enhanced JSON requests with 200 instead of a redirect', async () => {
		vi.mocked(writeConsent).mockClear();
		const res = await POST(postEvent('denied', '/dashboard', 'application/json'));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ choice: 'denied' });
		expect(writeConsent).toHaveBeenCalledWith({}, 'denied');
	});

	it('still validates the choice on enhanced requests', async () => {
		await expect(POST(postEvent('maybe', '/', 'application/json'))).rejects.toMatchObject({
			status: 400,
		});
	});

	it('rate limits enhanced requests too', async () => {
		vi.mocked(checkRateLimit).mockResolvedValueOnce(false);
		await expect(POST(postEvent('granted', '/', 'application/json'))).rejects.toMatchObject({
			status: 429,
		});
	});
});
