/**
 * Guards the rule that DB-backed suites never write to a remote database by
 * accident (issue #336).
 */
import { describe, it, expect } from 'vitest';
import { resolveDbGate, isLocalDbUrl, dbHost, skipNotice } from './helpers/db-gate';

const LOCAL = 'postgres://postgres:postgres@localhost:5432/mise_en_place_test';
const LOCAL_IP = 'postgresql://postgres@127.0.0.1:5432/mep';
const HOSTED = 'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres';
const POOLER = 'postgres://postgres.abcdefgh:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

describe('dbHost', () => {
	it('extracts the hostname', () => {
		expect(dbHost(LOCAL)).toBe('localhost');
		expect(dbHost(HOSTED)).toBe('db.abcdefgh.supabase.co');
	});

	it('unwraps IPv6 brackets', () => {
		expect(dbHost('postgres://postgres@[::1]:5432/mep')).toBe('::1');
	});

	it('returns empty string for unparseable input', () => {
		expect(dbHost('not a url')).toBe('');
		expect(dbHost('')).toBe('');
	});
});

describe('isLocalDbUrl', () => {
	it('accepts local hosts', () => {
		expect(isLocalDbUrl(LOCAL)).toBe(true);
		expect(isLocalDbUrl(LOCAL_IP)).toBe(true);
		expect(isLocalDbUrl('postgres://postgres@[::1]:5432/mep')).toBe(true);
		expect(isLocalDbUrl('postgres://postgres@host.docker.internal:5432/mep')).toBe(true);
	});

	it('rejects hosted databases', () => {
		expect(isLocalDbUrl(HOSTED)).toBe(false);
		expect(isLocalDbUrl(POOLER)).toBe(false);
	});

	it('does not treat a database named "localhost" as local', () => {
		expect(isLocalDbUrl('postgresql://postgres:pw@db.example.supabase.co:5432/localhost')).toBe(
			false
		);
	});

	it('treats unparseable URLs as remote', () => {
		expect(isLocalDbUrl('postgres://')).toBe(false);
		expect(isLocalDbUrl('')).toBe(false);
	});
});

describe('resolveDbGate', () => {
	it('enables tests for a local DATABASE_URL', () => {
		const gate = resolveDbGate({ DATABASE_URL: LOCAL });
		expect(gate.enabled).toBe(true);
		expect(gate.isLocal).toBe(true);
		expect(gate.url).toBe(LOCAL);
		expect(gate.skipReason).toBe('');
	});

	it('disables tests for a hosted DATABASE_URL', () => {
		const gate = resolveDbGate({ DATABASE_URL: HOSTED });
		expect(gate.enabled).toBe(false);
		expect(gate.skipReason).toContain('db.abcdefgh.supabase.co');
	});

	it('re-enables a hosted URL only with an explicit opt-in', () => {
		expect(resolveDbGate({ DATABASE_URL: HOSTED, ALLOW_REMOTE_DB_TESTS: '1' }).enabled).toBe(true);
		expect(resolveDbGate({ DATABASE_URL: HOSTED, ALLOW_REMOTE_DB_TESTS: 'true' }).enabled).toBe(
			false
		);
		expect(resolveDbGate({ DATABASE_URL: HOSTED, ALLOW_REMOTE_DB_TESTS: '0' }).enabled).toBe(false);
	});

	it('prefers DATABASE_TEST_URL over DATABASE_URL', () => {
		const gate = resolveDbGate({ DATABASE_URL: HOSTED, DATABASE_TEST_URL: LOCAL });
		expect(gate.url).toBe(LOCAL);
		expect(gate.enabled).toBe(true);
	});

	it('still gates DATABASE_TEST_URL when it points somewhere remote', () => {
		const gate = resolveDbGate({ DATABASE_URL: LOCAL, DATABASE_TEST_URL: HOSTED });
		expect(gate.url).toBe(HOSTED);
		expect(gate.enabled).toBe(false);
	});

	it('disables tests when nothing is configured', () => {
		const gate = resolveDbGate({});
		expect(gate.enabled).toBe(false);
		expect(gate.url).toBe('');
		expect(gate.skipReason).toContain('DATABASE_URL');
	});
});

describe('skipNotice', () => {
	it('states the reason and both escape hatches', () => {
		const notice = skipNotice(resolveDbGate({ DATABASE_URL: HOSTED }));
		expect(notice).toContain('SKIPPED');
		expect(notice).toContain('db.abcdefgh.supabase.co');
		expect(notice).toContain('DATABASE_TEST_URL');
		expect(notice).toContain('ALLOW_REMOTE_DB_TESTS=1');
	});
});
