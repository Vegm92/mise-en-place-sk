/**
 * DB singleton — server-side only.
 * Import only from +server.ts or +page.server.ts, never from components.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const connectionString = env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
