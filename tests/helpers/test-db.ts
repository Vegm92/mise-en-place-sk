/**
 * Shared test DB helpers — use direct postgres.js + dotenv instead of
 * $env/dynamic/private so tests work outside SvelteKit's runtime.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/lib/server/schema';
import { resolveDbGate } from './db-gate';

const _gate = resolveDbGate(process.env);
const _url = _gate.url;
const _isLocal = _gate.isLocal;

/**
 * True when DB-backed suites may run: a local/ephemeral Postgres, or a remote
 * one the developer explicitly opted into with ALLOW_REMOTE_DB_TESTS=1.
 * A hosted DATABASE_URL alone is NOT enough — these tests write and delete
 * real rows (issue #336).
 */
export const hasDbEnv = _gate.enabled;

// When REQUIRE_DB_TESTS=1 (set by CI when secrets are known to be configured),
// a disabled DB gate is a hard failure rather than a silent skip — it means the
// workflow's DATABASE_URL is missing or no longer points at the service container.
if (process.env.REQUIRE_DB_TESTS === '1' && !hasDbEnv) {
	throw new Error(
		`\nREQUIRE_DB_TESTS=1 but DB-backed tests are disabled: ${_gate.skipReason}.\n` +
			'Point DATABASE_URL at the CI Postgres service, or set ALLOW_REMOTE_DB_TESTS=1 to opt in.\n'
	);
}

// max:2 per worker × 4 parallel test files = 8 connections, within pool_size:15
const _client = hasDbEnv
	? postgres(_url, { ssl: _isLocal ? false : 'require', max: 2, idle_timeout: 10 })
	: null;

const _realDb = hasDbEnv ? drizzle(_client!, { schema }) : null;
export const testDb  = _realDb as NonNullable<typeof _realDb>;
export const testSql = _client as NonNullable<typeof _client>;

export async function closeDb() {
	// timeout:5 force-closes after 5s so afterAll hooks never hang
	if (_client) await _client.end({ timeout: 5 });
}

/** Creates a uniquely-slugged test restaurant and returns its id. */
export async function createTestRestaurant(suffix: string) {
	const slug = `test-vitest-${suffix}-${Date.now()}`;
	const [row] = await testSql`
		INSERT INTO restaurants (name, slug) VALUES (${'Test Restaurant ' + suffix}, ${slug}) RETURNING id, slug
	`;
	return row as { id: string; slug: string };
}

/** Deletes a test restaurant by id (cascades to all related tables). No-ops on empty id. */
export async function cleanupTestRestaurant(id: string) {
	if (!id) return;
	await testSql`DELETE FROM restaurants WHERE id = ${id}`;
}

/** Deletes any orphaned test-vitest restaurants (safety net). */
export async function cleanupAllTestRestaurants() {
	await testSql`DELETE FROM restaurants WHERE slug LIKE 'test-vitest-%'`;
}

const DEADLOCK_SQLSTATE = '40P01';

function isDeadlock(err: unknown): boolean {
	const e = err as { code?: string; message?: string; stderr?: Buffer | string };
	return e?.code === DEADLOCK_SQLSTATE
		|| String(e?.message ?? '').includes('deadlock detected')
		|| String(e?.stderr ?? '').includes('deadlock detected');
}

/**
 * Role-provisioning DDL (CREATE ROLE, GRANT ... ON ALL TABLES, DROP OWNED BY)
 * locks every table in the schema, so under a parallel `pnpm test` run it can
 * deadlock against another file's cascading DELETE. Postgres aborts one side
 * with SQLSTATE 40P01; the statement is safe to retry once the other side has
 * committed. Only 40P01 is retried — every other error still fails the suite.
 */
export async function retryOnDeadlock<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (!isDeadlock(err) || attempt >= attempts) throw err;
			await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
		}
	}
}
