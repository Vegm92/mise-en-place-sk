/**
 * DB-level Row Level Security enforcement tests.
 *
 * `tenant-isolation.test.ts` proves the application's `forTenant()` WHERE
 * scoping. This suite proves the *complementary* guarantee required by the
 * production sign-off gate (issue #200): the policies in
 * `drizzle/0001_rls_policies.sql` deny cross-tenant reads and writes at the
 * database level for a NON-superuser role — i.e. the Supabase Data API path
 * (anon / authenticated) — independent of any application code.
 *
 * CI and local runs connect as the `postgres` superuser, which bypasses RLS,
 * so RLS is otherwise never exercised by the test suite. Here we create a
 * non-privileged `authenticated` role and switch into it (`SET LOCAL ROLE`)
 * to force the policies to be evaluated, resolving `auth.uid()` from a
 * transaction-local GUC (the same shape Supabase resolves from the JWT).
 *
 * Runs only against a LOCAL / ephemeral Postgres (isLocalDb): it issues
 * privileged DDL (CREATE ROLE, CREATE OR REPLACE FUNCTION auth.uid) and must
 * never run against a real Supabase database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { hasDbEnv, isLocalDb } from './helpers/test-db';

const runDbLevelRls = hasDbEnv && isLocalDb;

// Dedicated single-connection client so SET ROLE / GUC state never leaks into
// the shared test pool. max:1 keeps every statement on the same backend.
const sql = runDbLevelRls
	? postgres(process.env.DATABASE_URL!, { ssl: false, max: 1, idle_timeout: 5 })
	: (null as never);

const RID_A = '11111111-1111-1111-1111-111111111111';
const RID_B = '22222222-2222-2222-2222-222222222222';
const UID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** Run `fn` inside a transaction acting as the RLS-bound `authenticated` role. */
async function asUser<T>(uid: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
	return sql.begin(async (tx) => {
		await tx`SET LOCAL ROLE authenticated`;
		await tx`SELECT set_config('app.uid', ${uid ?? ''}, true)`;
		return fn(tx);
	}) as Promise<T>;
}

beforeAll(async () => {
	if (!runDbLevelRls) return;

	// Non-privileged role that must obey RLS, plus the minimum grants the
	// Supabase Data API role would hold. Idempotent so re-runs are safe.
	await sql.unsafe(`
		DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
				CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
			END IF;
		END $$;
		GRANT USAGE ON SCHEMA public, auth TO authenticated;
		GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
		GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
	`);

	// Resolve auth.uid() from a transaction-local GUC (local/ephemeral only).
	// The auth.uid() stub may already exist as either text (CI's ci-db-setup.sql)
	// or uuid (a Supabase-shaped stub); its return type cannot be changed while
	// the RLS policies depend on it, so match whatever is already defined.
	const [{ rettype }] = await sql<{ rettype: string }[]>`
		SELECT format_type(prorettype, NULL) AS rettype
		FROM pg_proc WHERE proname = 'uid' AND pronamespace = 'auth'::regnamespace`;
	const cast = rettype === 'uuid' ? '::uuid' : '';
	await sql.unsafe(`
		CREATE OR REPLACE FUNCTION auth.uid() RETURNS ${rettype} LANGUAGE sql STABLE AS
		$fn$ SELECT nullif(current_setting('app.uid', true), '')${cast} $fn$;
	`);

	// Seed two tenants; user A ∈ restaurant A, user B ∈ restaurant B.
	await sql`DELETE FROM restaurants WHERE slug LIKE 'rls-enf-%'`;
	await sql`INSERT INTO restaurants (id, name, slug) VALUES
		(${RID_A}, 'RLS Enf A', 'rls-enf-a'), (${RID_B}, 'RLS Enf B', 'rls-enf-b')`;
	await sql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES
		(${UID_A}, ${RID_A}, 'owner'), (${UID_B}, ${RID_B}, 'owner')`;
	await sql`INSERT INTO suppliers (restaurant_id, name) VALUES
		(${RID_A}, '__rls_enf_A__'), (${RID_B}, '__rls_enf_B__')`;
});

afterAll(async () => {
	if (!runDbLevelRls) return;
	await sql`DELETE FROM restaurants WHERE slug LIKE 'rls-enf-%'`;
	await sql.end({ timeout: 5 });
});

const names = (rows: readonly { name: string }[]) => rows.map((r) => r.name).sort();

describe.skipIf(!runDbLevelRls)('RLS — cross-tenant reads denied at the DB level', () => {
	it('superuser (app request path) bypasses RLS and sees both tenants', async () => {
		const rows = await sql<{ name: string }[]>`
			SELECT name FROM suppliers WHERE name LIKE '__rls_enf_%'`;
		expect(names(rows)).toEqual(['__rls_enf_A__', '__rls_enf_B__']);
	});

	it('user A sees only their own tenant', async () => {
		const rows = await asUser(UID_A, (tx) => tx<{ name: string }[]>`
			SELECT name FROM suppliers WHERE name LIKE '__rls_enf_%'`);
		expect(names(rows)).toEqual(['__rls_enf_A__']);
	});

	it('user B sees only their own tenant', async () => {
		const rows = await asUser(UID_B, (tx) => tx<{ name: string }[]>`
			SELECT name FROM suppliers WHERE name LIKE '__rls_enf_%'`);
		expect(names(rows)).toEqual(['__rls_enf_B__']);
	});

	it('an unauthenticated session (no auth.uid) sees nothing', async () => {
		const rows = await asUser(null, (tx) => tx<{ name: string }[]>`
			SELECT name FROM suppliers WHERE name LIKE '__rls_enf_%'`);
		expect(rows).toHaveLength(0);
	});
});

describe.skipIf(!runDbLevelRls)('RLS — cross-tenant writes denied at the DB level', () => {
	it('user A cannot INSERT a row into tenant B', async () => {
		await expect(
			asUser(UID_A, (tx) => tx`
				INSERT INTO suppliers (restaurant_id, name) VALUES (${RID_B}, '__rls_enf_hack__')`)
		).rejects.toThrow(/row-level security/i);
	});

	it("user A's UPDATE of tenant B's row affects zero rows", async () => {
		const rows = await asUser(UID_A, (tx) => tx`
			UPDATE suppliers SET name = '__rls_enf_hijacked__'
			WHERE name = '__rls_enf_B__' RETURNING id`);
		expect(rows).toHaveLength(0);
	});

	it('user A cannot move their own row into tenant B', async () => {
		await expect(
			asUser(UID_A, (tx) => tx`
				UPDATE suppliers SET restaurant_id = ${RID_B} WHERE name = '__rls_enf_A__'`)
		).rejects.toThrow(/row-level security/i);
	});

	it('tenant B data is intact after the denied writes', async () => {
		const rows = await sql<{ name: string; restaurant_id: string }[]>`
			SELECT name, restaurant_id FROM suppliers WHERE name = '__rls_enf_B__'`;
		expect(rows).toHaveLength(1);
		expect(rows[0]?.restaurant_id).toBe(RID_B);
	});
});
