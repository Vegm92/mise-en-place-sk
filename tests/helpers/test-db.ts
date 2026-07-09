/**
 * Shared test DB helpers — use direct postgres.js + dotenv instead of
 * $env/dynamic/private so tests work outside SvelteKit's runtime.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createClient } from '@supabase/supabase-js';
import * as schema from '../../src/lib/server/schema';

const _url = process.env.DATABASE_URL ?? '';
const _isLocal = /localhost|127\.0\.0\.1/.test(_url);

/** True when a plain Postgres connection is available (ephemeral CI or Supabase). */
export const hasDbEnv = !!_url;

/**
 * True when DATABASE_URL points at a local/ephemeral Postgres (CI service
 * container or local dev), as opposed to a hosted Supabase pooler. Guards
 * tests that run privileged DDL (roles, function redefinition) which must
 * never touch a real Supabase database.
 */
export const isLocalDb = _isLocal;

/** True when Supabase-specific vars are present (auth tests, connection tests). */
export const hasSupabaseEnv = !!(
	_url &&
	process.env.SUPABASE_URL &&
	process.env.SUPABASE_ANON_KEY &&
	process.env.SUPABASE_SERVICE_ROLE_KEY
);

// When REQUIRE_DB_TESTS=1 (set by CI when secrets are known to be configured),
// missing Supabase vars are a hard failure rather than a silent skip. This
// catches typo'd secret names or accidentally dropped env entries in the workflow.
if (process.env.REQUIRE_DB_TESTS === '1' && !hasSupabaseEnv) {
	const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
		(k) => !process.env[k]
	);
	throw new Error(
		`\nREQUIRE_DB_TESTS=1 but required Supabase env vars are missing: ${missing.join(', ')}\n` +
			'Ensure CI secrets are configured correctly, or remove REQUIRE_DB_TESTS to allow skipping.\n'
	);
}

// max:2 per worker × 4 parallel test files = 8 connections, within pool_size:15
const _client = hasDbEnv
	? postgres(_url, { ssl: _isLocal ? false : 'require', max: 2, idle_timeout: 10 })
	: null;

const _realDb = hasDbEnv ? drizzle(_client!, { schema }) : null;
export const testDb  = _realDb as NonNullable<typeof _realDb>;
export const testSql = _client as NonNullable<typeof _client>;

const _realAdmin = hasSupabaseEnv
	? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
	: null;
export const supabaseAdmin = _realAdmin as NonNullable<typeof _realAdmin>;

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
