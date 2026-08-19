/**
 * Postgres TLS policy (issue #295) — the web pool and the worker's pg-boss
 * connection must resolve the same config from the same env vars, so the
 * worker can no longer drift back to skipping certificate verification.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

afterEach(() => vi.restoreAllMocks());

function mockEnv(overrides: Record<string, unknown>) {
	vi.resetModules();
	vi.doMock('$lib/server/env', () => ({
		config: {
			database: {
				sslMode: overrides.DATABASE_SSL_MODE ?? '',
				caCert: overrides.DATABASE_CA_CERT ?? '',
			},
			app: {
				nodeEnv: overrides.NODE_ENV ?? 'development',
			},
		},
	}));
}

describe('pgSslConfig', () => {
	it('defaults to encrypted-but-unverified (require)', async () => {
		mockEnv({});
		const { pgSslConfig } = await import('../src/lib/server/db-ssl');
		expect(pgSslConfig()).toEqual({ rejectUnauthorized: false });
	});

	it('verifies the certificate chain in verify-full mode', async () => {
		mockEnv({ DATABASE_SSL_MODE: 'verify-full' });
		const { pgSslConfig } = await import('../src/lib/server/db-ssl');
		expect(pgSslConfig()).toEqual({ rejectUnauthorized: true });
	});

	it('accepts an inline PEM in DATABASE_CA_CERT', async () => {
		mockEnv({ DATABASE_SSL_MODE: 'verify-full', DATABASE_CA_CERT: PEM });
		const { pgSslConfig } = await import('../src/lib/server/db-ssl');
		expect(pgSslConfig()).toEqual({ rejectUnauthorized: true, ca: PEM });
	});

	it('accepts a path to a CA file in DATABASE_CA_CERT', async () => {
		const file = path.join(mkdtempSync(path.join(tmpdir(), 'mep-ca-')), 'test-ca.crt');
		writeFileSync(file, PEM);
		mockEnv({ DATABASE_SSL_MODE: 'verify-full', DATABASE_CA_CERT: file });
		const { pgSslConfig } = await import('../src/lib/server/db-ssl');
		expect(pgSslConfig()).toEqual({ rejectUnauthorized: true, ca: PEM });
	});

	it('ignores DATABASE_CA_CERT outside verify-full mode', async () => {
		mockEnv({ DATABASE_CA_CERT: PEM });
		const { pgSslConfig } = await import('../src/lib/server/db-ssl');
		expect(pgSslConfig()).toEqual({ rejectUnauthorized: false });
	});

	it('warns and falls back to require on an unknown mode', async () => {
		mockEnv({ DATABASE_SSL_MODE: 'disable' });
		const { pgSslConfig } = await import('../src/lib/server/db-ssl');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(pgSslConfig()).toEqual({ rejectUnauthorized: false });
		expect(warn).toHaveBeenCalled();
	});

	it('warns in production when the certificate is not verified', async () => {
		mockEnv({ NODE_ENV: 'production' });
		const { pgSslConfig } = await import('../src/lib/server/db-ssl');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		pgSslConfig();
		expect(String(warn.mock.calls.at(-1)?.[0])).toContain('verify-full');
	});

	it('stays quiet in production when verification is on', async () => {
		mockEnv({ NODE_ENV: 'production', DATABASE_SSL_MODE: 'verify-full' });
		const { pgSslConfig } = await import('../src/lib/server/db-ssl');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		pgSslConfig();
		expect(warn).not.toHaveBeenCalled();
	});
});
