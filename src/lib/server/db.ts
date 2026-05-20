/**
 * DB singleton — server-side only.
 * Import this only from +server.ts or +page.server.ts files, never from components.
 *
 * DATABASE_URL defaults to mise_en_place.db in the project root.
 * Override via .env for production deployments.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import * as schema from './schema';
import { cleanupStaleSessions } from './sessions';
import { seedAdminUser } from './auth-seed';

const rawUrl = env.DATABASE_URL ?? 'mise_en_place.db';
const url = rawUrl.startsWith('/') ? rawUrl : resolve(process.cwd(), rawUrl);

export const dbClient = new Database(url);

dbClient.pragma('journal_mode = WAL');

export const db = drizzle(dbClient, { schema });

migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });

cleanupStaleSessions();
seedAdminUser().catch(e => console.error('[auth-seed]', e));
