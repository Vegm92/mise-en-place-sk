import { describe, it, expect, vi } from 'vitest';
import { siteOrigin, canonicalUrl } from '../src/lib/server/site-origin';
import { sendVerificationEmail } from '../src/lib/server/verification-email';

const sendEmailMock = vi.fn().mockResolvedValue(undefined);
const createVerificationTokenMock = vi.fn().mockResolvedValue('tok_test_123');

vi.mock('../src/lib/server/email', () => ({
	sendEmail: (payload: unknown) => sendEmailMock(payload),
	verifyEmailAddress: (email: string, url: string) => ({ to: email, subject: 'verify', html: url }),
}));

vi.mock('../src/lib/server/verification-token', () => ({
	createVerificationToken: (...args: unknown[]) => createVerificationTokenMock(...args),
}));

describe('siteOrigin and canonicalUrl helpers', () => {
	it('canonicalUrl formats path with siteOrigin', () => {
		const requestUrl = new URL('http://attacker.com/some/path?foo=bar');
		expect(canonicalUrl(requestUrl, '/s/abc123token')).toContain('/s/abc123token');
	});

	it('sendVerificationEmail builds URL via siteOrigin', async () => {
		sendEmailMock.mockClear();
		const spoofedUrl = new URL('http://attacker.com/signup');
		await sendVerificationEmail(spoofedUrl, 'user@example.com');

		expect(sendEmailMock).toHaveBeenCalledOnce();
		const emailPayload = sendEmailMock.mock.calls[0]?.[0] as { to: string; html: string };
		expect(emailPayload.to).toBe('user@example.com');
		expect(emailPayload.html).toContain('/verify-email?email=user%40example.com&token=tok_test_123');
	});
});
