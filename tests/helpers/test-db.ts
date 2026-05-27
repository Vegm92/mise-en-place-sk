/**
 * Shared test DB helpers — use direct postgres.js + dotenv instead of
 * $env/dynamic/private so tests work outside SvelteKit's runtime.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createClient } from '@supabase/supabase-js';
import * as schema from '../../src/lib/server/schema';

// max:2 per worker × 4 parallel test files = 8 connections, within Supabase free pool_size:15
const _client = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 2, idle_timeout: 10 });

export const testDb  = drizzle(_client, { schema });
export const testSql = _client;

export const supabaseAdmin = createClient(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function closeDb() {
	await _client.end();
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
