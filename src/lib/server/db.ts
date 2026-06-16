/**
 * DB singleton — server-side only.
 * Import only from +server.ts or +page.server.ts, never from components.
 *
 * Set DATABASE_POOL_URL to a Supabase Session Mode / PgBouncer URL for the
 * runtime app; DATABASE_URL remains the direct connection used by migrations
 * and pg-boss. If DATABASE_POOL_URL is not set, DATABASE_URL is used for both.
 * prepare: false is required for PgBouncer transaction-mode compatibility.
 */
import { env } from '$env/dynamic/private';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

/**
 * Lazily create the Drizzle client on first use. We intentionally do NOT
 * connect at import time: SvelteKit's build/prerender-analyse step imports
 * server modules without runtime env, and a throw here would break the build.
 * The connection (and the missing-config error) is deferred to the first query.
 */
function getDb(): DB {
	if (_db) return _db;
	const connectionString = env.DATABASE_POOL_URL ?? env.DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL (or DATABASE_POOL_URL) is required');
	const client = postgres(connectionString, { prepare: false, ssl: 'require' });
	_db = drizzle(client, { schema });
	return _db;
}

// Proxy so existing `db.select(...)` call sites keep working while the
// underlying client is created lazily on first property access. Methods are
// bound to the real Drizzle instance so internal `this` references resolve
// against it (not the proxy).
export const db: DB = new Proxy({} as DB, {
	get(_target, prop) {
		const real = getDb();
		const value = Reflect.get(real as object, prop, real);
		return typeof value === 'function' ? value.bind(real) : value;
	}
});

// Tenant-scoped query helper — see ARCHITECTURE_DECISIONS.md ADR-001.
export { forTenant } from './tenant';
