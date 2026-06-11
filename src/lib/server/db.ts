/**
 * DB singleton — server-side only.
 * Import only from +server.ts or +page.server.ts, never from components.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const client = postgres(connectionString, { prepare: false, ssl: 'require' });

export const db = drizzle(client, { schema });

// Tenant-scoped query helper — see ARCHITECTURE_DECISIONS.md ADR-001.
export { forTenant } from './tenant';
