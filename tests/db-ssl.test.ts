/**
 * Postgres TLS policy (issue #295) — the web pool and the worker's pg-boss
 * connection must resolve the same config from the same env vars, so the
 * worker can no longer drift back to skipping certificate verification.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pgSslConfig } from '../src/lib/server/db-ssl';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

afterEach(() => vi.restoreAllMocks());

describe('pgSslConfig', () => {
	it('defaults to encrypted-but-unverified (require)', () => {
		expect(pgSslConfig({})).toEqual({ rejectUnauthorized: false });
	});

	it('verifies the certificate chain in verify-full mode', () => {
		expect(pgSslConfig({ DATABASE_SSL_MODE: 'verify-full' })).toEqual({ rejectUnauthorized: true });
	});

	it('accepts an inline PEM in DATABASE_CA_CERT', () => {
		expect(pgSslConfig({ DATABASE_SSL_MODE: 'verify-full', DATABASE_CA_CERT: PEM }))
			.toEqual({ rejectUnauthorized: true, ca: PEM });
	});

	it('accepts a path to a CA file in DATABASE_CA_CERT', () => {
		const file = path.join(mkdtempSync(path.join(tmpdir(), 'mep-ca-')), 'supabase.crt');
		writeFileSync(file, PEM);
		expect(pgSslConfig({ DATABASE_SSL_MODE: 'verify-full', DATABASE_CA_CERT: file }))
			.toEqual({ rejectUnauthorized: true, ca: PEM });
	});

	it('ignores DATABASE_CA_CERT outside verify-full mode', () => {
		expect(pgSslConfig({ DATABASE_CA_CERT: PEM })).toEqual({ rejectUnauthorized: false });
	});

	it('warns and falls back to require on an unknown mode', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(pgSslConfig({ DATABASE_SSL_MODE: 'disable' })).toEqual({ rejectUnauthorized: false });
		expect(warn).toHaveBeenCalled();
	});

	it('warns in production when the certificate is not verified', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		pgSslConfig({ NODE_ENV: 'production' });
		expect(String(warn.mock.calls.at(-1)?.[0])).toContain('verify-full');
	});

	it('stays quiet in production when verification is on', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		pgSslConfig({ NODE_ENV: 'production', DATABASE_SSL_MODE: 'verify-full' });
		expect(warn).not.toHaveBeenCalled();
	});
});
