import { describe, it, expect, vi, afterEach } from 'vitest';

async function sendWithoutKey(nodeEnv: string) {
	vi.stubEnv('RESEND_API_KEY', '');
	vi.stubEnv('NODE_ENV', nodeEnv);
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.resetModules();
	const sentry = await import('@sentry/sveltekit');
	const { sendEmail } = await import('../src/lib/server/email');
	await sendEmail({ to: 'owner@example.com', subject: 'Resumen semanal', html: '<p>hi</p>', kind: 'weekly_digest' });
	return { errorSpy, logSpy, captureMessage: vi.mocked(sentry.captureMessage) };
}

describe('sendEmail without RESEND_API_KEY (#1136)', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('in production drops the email loudly: console.error plus a Sentry event tagged with the kind, address masked', async () => {
		const { errorSpy, logSpy, captureMessage } = await sendWithoutKey('production');

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
		const { errorSpy, logSpy, captureMessage } = await sendWithoutKey('test');

		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(String(logSpy.mock.calls[0]![0])).toContain('no-op');
		expect(errorSpy).not.toHaveBeenCalled();
		expect(captureMessage).not.toHaveBeenCalled();
	});
});
