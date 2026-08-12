import { env } from '$env/dynamic/private';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { pgSslConfig } from './db-ssl';

type DB = ReturnType<typeof drizzle<typeof schema>>;

const CONNECT_TIMEOUT_SECONDS = parseInt(env.DB_CONNECT_TIMEOUT_SECONDS ?? '10', 10);
const STATEMENT_TIMEOUT_MS = parseInt(env.DB_STATEMENT_TIMEOUT_MS ?? '15000', 10);

let _db: DB | null = null;

function getDb(): DB {
	if (_db) return _db;
	const connectionString = env.DATABASE_POOL_URL ?? env.DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL (or DATABASE_POOL_URL) is required');
	const client = postgres(connectionString, {
		prepare: false,
		ssl: pgSslConfig(),
		connect_timeout: CONNECT_TIMEOUT_SECONDS,
		connection: { statement_timeout: STATEMENT_TIMEOUT_MS },
	});
	_db = drizzle(client, { schema });
	return _db;
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
