import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadFresh() {
	vi.resetModules();
	const sentry = await import('@sentry/sveltekit');
	const { sendEmail } = await import('../src/lib/server/email');
	return { sendEmail, captureMessage: vi.mocked(sentry.captureMessage) };
}

describe('sendEmail without RESEND_API_KEY (#1136)', () => {
	beforeEach(() => {
		vi.stubEnv('RESEND_API_KEY', '');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('in production drops the email loudly: console.error plus a Sentry event tagged with the kind, address masked', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const { sendEmail, captureMessage } = await loadFresh();

		await sendEmail({ to: 'owner@example.com', subject: 'Resumen semanal', html: '<p>hi</p>', kind: 'weekly_digest' });

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const line = String(errorSpy.mock.calls[0]![0]);
		expect(line).toContain('DROPPED');
		expect(line).toContain('weekly_digest');
		expect(line).toContain('o***@example.com');
		expect(line).not.toContain('owner@example.com');
		expect(captureMessage).toHaveBeenCalledWith(
			'email.dropped_no_api_key',
			expect.objectContaining({ level: 'error', tags: { emailKind: 'weekly_digest' } }),
		);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('outside production stays a logged no-op with no Sentry event', async () => {
		vi.stubEnv('NODE_ENV', 'test');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const { sendEmail, captureMessage } = await loadFresh();

		await sendEmail({ to: 'owner@example.com', subject: 'x', html: '<p>hi</p>', kind: 'trial_expiry' });

		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(String(logSpy.mock.calls[0]![0])).toContain('no-op');
		expect(errorSpy).not.toHaveBeenCalled();
		expect(captureMessage).not.toHaveBeenCalled();
	});
});
