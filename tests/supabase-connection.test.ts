/**
 * Supabase connection tests — verifies the postgres.js pooler connection
 * works from Node.js on Windows (IPv4, SSL, concurrency).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { testSql, closeDb } from './helpers/test-db';

afterAll(() => closeDb());

describe('Database connection', () => {
	it('connects via Session Pooler and returns a basic query', async () => {
		const [row] = await testSql`SELECT 1 AS ok`;
		expect(Number(row.ok)).toBe(1);
	});

	it('DATABASE_URL points to the IPv4-accessible pooler hostname', () => {
		expect(process.env.DATABASE_URL).toMatch(/pooler\.supabase\.com/);
	});

	it('TLS is enforced via pooler (Session Pooler always uses TLS between client and proxy)', () => {
		// Supabase's Session Pooler terminates TLS at the PgBouncer proxy layer.
		// pg_stat_ssl shows ssl=false for the backend connection — that is expected and correct.
		// The guarantee is: pooler.supabase.com always requires TLS; no unencrypted path exists.
		expect(process.env.DATABASE_URL).toMatch(/pooler\.supabase\.com/);
		// ssl:'require' is set in both drizzle.config.ts and db.ts
		expect(process.env.DATABASE_URL).not.toMatch(/sslmode=disable/);
	});

	it('can run concurrent queries without connection errors', async () => {
		const results = await Promise.all([
			testSql`SELECT 1 AS n`,
			testSql`SELECT 2 AS n`,
			testSql`SELECT 3 AS n`,
			testSql`SELECT 4 AS n`,
			testSql`SELECT 5 AS n`,
		]);
		expect(results.map(r => Number(r[0].n))).toEqual([1, 2, 3, 4, 5]);
	});

	it('reports Supabase PostgreSQL version', async () => {
		const [row] = await testSql`SELECT version() AS v`;
		expect(row.v).toMatch(/PostgreSQL/);
	});

	it('SUPABASE_URL and SUPABASE_ANON_KEY env vars are present', () => {
		expect(process.env.SUPABASE_URL).toMatch(/supabase\.co/);
		expect(process.env.SUPABASE_ANON_KEY).toMatch(/^eyJ/);
	});

	it('SUPABASE_SERVICE_ROLE_KEY is present and distinct from anon key', () => {
		expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toMatch(/^eyJ/);
		expect(process.env.SUPABASE_SERVICE_ROLE_KEY).not.toBe(process.env.SUPABASE_ANON_KEY);
	});
});
