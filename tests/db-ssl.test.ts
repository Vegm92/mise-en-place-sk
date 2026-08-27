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
		const file = path.join(mkdtempSync(path.join(tmpdir(), 'mep-ca-')), 'test-ca.crt');
		writeFileSync(file, PEM);
		expect(pgSslConfig({ DATABASE_SSL_MODE: 'verify-full', DATABASE_CA_CERT: file }))
			.toEqual({ rejectUnauthorized: true, ca: PEM });
	});

	it('rejects a DATABASE_CA_CERT that is neither a PEM nor a readable file', () => {
		const missing = path.join(mkdtempSync(path.join(tmpdir(), 'mep-ca-')), 'absent.crt');
		expect(() => pgSslConfig({ DATABASE_SSL_MODE: 'verify-full', DATABASE_CA_CERT: missing }))
			.toThrow(/DATABASE_CA_CERT/);
	});

	it('points at the swapped-variable mistake when DATABASE_CA_CERT holds a mode name', () => {
		expect(() => pgSslConfig({ DATABASE_CA_CERT: 'verify-full' }))
			.toThrow(/did you mean DATABASE_SSL_MODE=verify-full/);
	});

	it('keeps a connection string out of the DATABASE_CA_CERT error message', () => {
		const url = 'postgres://user:hunter2@db.example.com:5432/app';
		expect(() => pgSslConfig({ DATABASE_CA_CERT: url })).toThrow(/<redacted>/);
		expect(() => pgSslConfig({ DATABASE_CA_CERT: url })).not.toThrow(/hunter2/);
	});

	it('shows the offending value when it merely contains an @', () => {
		const banner = 'No SSH keys registered with Railway.\nKey: someone@their-host (SHA256:abc)\n';
		expect(() => pgSslConfig({ DATABASE_CA_CERT: banner }))
			.toThrow(/No SSH keys registered with Railway/);
	});

	it('tolerates surrounding whitespace on the mode and on a CA file path', () => {
		const file = path.join(mkdtempSync(path.join(tmpdir(), 'mep-ca-')), 'padded-ca.crt');
		writeFileSync(file, PEM);
		expect(pgSslConfig({ DATABASE_SSL_MODE: ' Verify-Full\n', DATABASE_CA_CERT: `  ${file}\n` }))
			.toEqual({ rejectUnauthorized: true, ca: PEM });
	});

	it('verifies the chain without hostname check when require mode pins a CA', () => {
		const config = pgSslConfig({ DATABASE_CA_CERT: PEM });
		expect(config).toMatchObject({ rejectUnauthorized: true, ca: PEM });
		expect(config && config.checkServerIdentity?.()).toBeUndefined();
		expect(typeof (config && config.checkServerIdentity)).toBe('function');
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

	it('stays quiet in production when require mode pins a CA', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		pgSslConfig({ NODE_ENV: 'production', DATABASE_CA_CERT: PEM });
		expect(warn).not.toHaveBeenCalled();
	});
});
