import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { pgSslConfig } from './db-ssl';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const DATABASE_POOL_URL = process.env.DATABASE_POOL_URL ?? '';
const DB_CONNECT_TIMEOUT_SECONDS = parseInt(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? '10', 10);
const DB_STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? '15000', 10);
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX ?? '20', 10);
const DB_POOL_IDLE_TIMEOUT_MS = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? '30000', 10);
const DB_POOL_MAX_LIFETIME_MS = parseInt(process.env.DB_POOL_MAX_LIFETIME_MS ?? '600000', 10);

type DB = ReturnType<typeof drizzle<typeof schema>>;

declare global {
	var _dbInstance: DB | undefined;
}

function getDb(): DB {
	if (globalThis._dbInstance) return globalThis._dbInstance;
	const connectionString = DATABASE_POOL_URL || DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL (or DATABASE_POOL_URL) is required');
	const client = postgres(connectionString, {
		prepare: false,
		ssl: pgSslConfig(),
		connect_timeout: DB_CONNECT_TIMEOUT_SECONDS,
		connection: { statement_timeout: DB_STATEMENT_TIMEOUT_MS },
		max: DB_POOL_MAX,
		idle_timeout: DB_POOL_IDLE_TIMEOUT_MS,
		max_lifetime: DB_POOL_MAX_LIFETIME_MS,
	});
	globalThis._dbInstance = drizzle(client, { schema });
	return globalThis._dbInstance;
}

export const db: DB = new Proxy({} as DB, {
	get(_target, prop) {
		const real = getDb();
		const value = Reflect.get(real as object, prop, real);
		return typeof value === 'function' ? value.bind(real) : value;
	}
});

export { getDb };

export { forTenant } from './tenant';
