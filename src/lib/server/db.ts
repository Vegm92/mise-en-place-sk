import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { pgSslConfig } from './db-ssl';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const DATABASE_POOL_URL = process.env.DATABASE_POOL_URL ?? '';
const DB_CONNECT_TIMEOUT_SECONDS = parseInt(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? '10', 10);
const DB_STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? '15000', 10);

type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

function getDb(): DB {
	if (_db) return _db;
	const connectionString = DATABASE_POOL_URL || DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL (or DATABASE_POOL_URL) is required');
	const client = postgres(connectionString, {
		prepare: false,
		ssl: pgSslConfig(),
		connect_timeout: DB_CONNECT_TIMEOUT_SECONDS,
		connection: { statement_timeout: DB_STATEMENT_TIMEOUT_MS },
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
