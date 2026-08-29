/**
 * DB-backed test for scripts/create-runtime-role.sql (issue #464).
 *
 * Runs the actual script (via psql — it uses psql meta-commands `\gexec` /
 * `\if` / `\set` that a plain SQL client cannot interpret) against the local
 * test database, under an isolated role name so it never touches a real
 * `mep_runtime` a developer may have set up for manual local use. Then proves
 * the three things the issue's acceptance criteria ask for: DML on an app
 * table works, a DDL statement is refused, and pg-boss can still start,
 * enqueue, and complete a job under the scoped role. Skipped when the DB gate
 * is closed, or when the `psql` binary is not on PATH.
 *
 * There is only one `pgboss` schema per database, so this transiently
 * reassigns its ownership to the isolated test role for the duration of the
 * run — afterAll reassigns it back to the connecting (owner) role before
 * dropping the test role, restoring the exact pre-test state.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';
import { PgBoss } from 'pg-boss';
import { testSql, closeDb, hasDbEnv } from './helpers/test-db';
import { resolveDbGate } from './helpers/db-gate';

const SCRIPT_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../scripts/create-runtime-role.sql',
);
const TEST_ROLE = 'mep_runtime_test';
const TEST_PASSWORD = `test-role-pw-${Date.now()}`;
const TEST_QUEUE = 'mep-runtime-role-test';

function psqlAvailable(): boolean {
	try {
		execFileSync('psql', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

const canRun = hasDbEnv && psqlAvailable();
const gate = resolveDbGate(process.env);
const baseUrl = canRun ? new URL(gate.url) : null;

function runtimeUrl(): string {
	const u = new URL(baseUrl!.toString());
	u.username = TEST_ROLE;
	u.password = TEST_PASSWORD;
	return u.toString();
}

async function dropTestRole(): Promise<void> {
	await testSql.unsafe(`
		DO $$
		BEGIN
			IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '${TEST_ROLE}') THEN
				EXECUTE 'REASSIGN OWNED BY ${TEST_ROLE} TO ' || quote_ident(current_user);
				EXECUTE 'DROP OWNED BY ${TEST_ROLE}';
				EXECUTE 'DROP ROLE ${TEST_ROLE}';
			END IF;
		END
		$$;
	`);
}

function runScript(): void {
	execFileSync(
		'psql',
		[baseUrl!.toString(), '-v', 'ON_ERROR_STOP=1', '-v', `runtime_role=${TEST_ROLE}`, '-f', SCRIPT_PATH],
		{ env: { ...process.env, RUNTIME_ROLE_PASSWORD: TEST_PASSWORD }, stdio: 'pipe' },
	);
}

let runtimeSql: ReturnType<typeof postgres> | null = null;

beforeAll(async () => {
	if (!canRun) return;
	await dropTestRole();
	runScript();
	runtimeSql = postgres(runtimeUrl(), { ssl: gate.isLocal ? false : 'require', max: 1 });
	// This suite proves GRANTs, not tenant isolation (that's #222's
	// tests/rls-runtime-role.test.ts) — #222 added row-level security
	// policies on top of these grants, so a bare probe query needs the
	// app.admin escape hatch to reach rows regardless of tenant.
	await runtimeSql`SELECT set_config('app.admin', 'true', false)`;
});

afterAll(async () => {
	if (!canRun) return;
	await runtimeSql?.end({ timeout: 5 });
	await dropTestRole().catch(() => {});
	await closeDb();
});

describe.skipIf(!canRun)('scripts/create-runtime-role.sql', () => {
	it('creates a LOGIN role with no superuser/createdb/createrole/bypassrls bits', async () => {
		const [row] = await testSql`
			SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin
			FROM pg_roles WHERE rolname = ${TEST_ROLE}
		`;
		expect(row).toMatchObject({
			rolsuper: false,
			rolcreatedb: false,
			rolcreaterole: false,
			rolreplication: false,
			rolbypassrls: false,
			rolcanlogin: true,
		});
	});

	it('is idempotent — re-running the script raises no error and keeps the same password', () => {
		expect(() => runScript()).not.toThrow();
	});

	it('grants SELECT/INSERT/UPDATE/DELETE on an existing app table', async () => {
		const slug = `test-runtime-role-${Date.now()}`;
		const [inserted] = await runtimeSql!`
			INSERT INTO restaurants (name, slug) VALUES ('Runtime Role Test', ${slug}) RETURNING id
		`;
		expect(inserted?.id).toBeTruthy();

		const [selected] = await runtimeSql!`SELECT name FROM restaurants WHERE id = ${inserted.id}`;
		expect(selected?.name).toBe('Runtime Role Test');

		await runtimeSql!`UPDATE restaurants SET name = 'Renamed' WHERE id = ${inserted.id}`;
		const [updated] = await runtimeSql!`SELECT name FROM restaurants WHERE id = ${inserted.id}`;
		expect(updated?.name).toBe('Renamed');

		await runtimeSql!`DELETE FROM restaurants WHERE id = ${inserted.id}`;
		const [gone] = await runtimeSql!`SELECT id FROM restaurants WHERE id = ${inserted.id}`;
		expect(gone).toBeUndefined();
	});

	it('refuses CREATE TABLE in the public schema', async () => {
		await expect(
			runtimeSql!.unsafe('CREATE TABLE ddl_should_fail_from_test (id int)'),
		).rejects.toThrow(/permission denied/i);
	});

	it('refuses ALTER TABLE on an existing app table (no ownership)', async () => {
		await expect(
			runtimeSql!.unsafe('ALTER TABLE restaurants ADD COLUMN hacked text'),
		).rejects.toThrow(/must be owner/i);
	});

	it('refuses CREATE ROLE (no CREATEROLE attribute)', async () => {
		await expect(
			runtimeSql!.unsafe("CREATE ROLE sneaky_should_fail_from_test"),
		).rejects.toThrow(/permission denied/i);
	});

	it('owns the pgboss schema, but not the public schema', async () => {
		const rows = await testSql`
			SELECT nspname, pg_get_userbyid(nspowner) AS owner
			FROM pg_namespace WHERE nspname IN ('public', 'pgboss')
		`;
		const byName = Object.fromEntries(rows.map((r) => [r.nspname, r.owner]));
		expect(byName.pgboss).toBe(TEST_ROLE);
		expect(byName.public).not.toBe(TEST_ROLE);
	});

	it('lets pg-boss start, enqueue, and complete a job under the runtime role', async () => {
		const boss = new PgBoss({ connectionString: runtimeUrl(), max: 1 });
		try {
			await boss.start();
			await boss.createQueue(TEST_QUEUE);
			const jobId = await boss.send(TEST_QUEUE, { ping: true });
			expect(jobId).toBeTruthy();

			const [job] = await boss.fetch(TEST_QUEUE, { batchSize: 1 }) ?? [];
			expect(job?.id).toBe(jobId);
			await boss.complete(TEST_QUEUE, job!.id);

			await boss.deleteQueue(TEST_QUEUE);
		} finally {
			await boss.stop({ graceful: false, close: true });
		}
	});
});
