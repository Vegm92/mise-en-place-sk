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

const connectionString = env.DATABASE_POOL_URL ?? env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL (or DATABASE_POOL_URL) is required');

const client = postgres(connectionString, { prepare: false, ssl: 'require' });

export const db = drizzle(client, { schema });

// Tenant-scoped query helper — see ARCHITECTURE_DECISIONS.md ADR-001.
export { forTenant } from './tenant';
