import { describe, it, expect, vi } from 'vitest';
import { POST } from '../src/routes/cookie-consent/+server';

vi.mock('$lib/server/cookie-consent', () => ({
	writeConsent: vi.fn(),
}));

vi.mock('$lib/server/rate-limiter', () => ({
	checkRateLimit: vi.fn().mockResolvedValue(true),
}));

function postEvent(choice: string, next?: string) {
	const formData = new FormData();
	formData.append('choice', choice);
	if (next !== undefined) formData.append('next', next);
	return {
		request: { formData: vi.fn().mockResolvedValue(formData) },
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
});
