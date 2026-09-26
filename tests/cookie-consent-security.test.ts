import { describe, it, expect, vi } from 'vitest';
import { POST } from '../src/routes/cookie-consent/+server';

vi.mock('$lib/server/cookie-consent', () => ({
	writeConsent: vi.fn(),
}));

vi.mock('$lib/server/rate-limiter', () => ({
	checkRateLimit: vi.fn().mockResolvedValue(true),
}));

describe('POST /cookie-consent security', () => {
	it('throws 400 Bad Request on invalid choice', async () => {
		const formData = new FormData();
		formData.append('choice', 'invalid_choice');

		const event = {
			request: {
				formData: vi.fn().mockResolvedValue(formData),
			},
			cookies: {},
			getClientAddress: () => '127.0.0.1',
		};

		await expect(POST(event as any)).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid choice value' },
		});
	});

	it('redirects safely when choice is granted', async () => {
		const formData = new FormData();
		formData.append('choice', 'granted');
		formData.append('next', '/dashboard');

		const event = {
			request: {
				formData: vi.fn().mockResolvedValue(formData),
			},
			cookies: {},
			getClientAddress: () => '127.0.0.1',
		};

		await expect(POST(event as any)).rejects.toMatchObject({
			status: 303,
			location: '/dashboard',
		});
	});

	it('sanitizes unsafe next redirect paths to /', async () => {
		const formData = new FormData();
		formData.append('choice', 'granted');
		formData.append('next', '\\evil.com');

		const event = {
			request: {
				formData: vi.fn().mockResolvedValue(formData),
			},
			cookies: {},
			getClientAddress: () => '127.0.0.1',
		};

		await expect(POST(event as any)).rejects.toMatchObject({
			status: 303,
			location: '/',
		});
	});
});
