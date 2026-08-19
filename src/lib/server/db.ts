import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { pgSslConfig } from './db-ssl';
import { config } from './env';

type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

function getDb(): DB {
	if (_db) return _db;
	const connectionString = config.database.poolUrl || config.database.url;
	if (!connectionString) throw new Error('DATABASE_URL (or DATABASE_POOL_URL) is required');
	const client = postgres(connectionString, {
		prepare: false,
		ssl: pgSslConfig(),
		connect_timeout: config.database.connectTimeoutSec,
		connection: { statement_timeout: config.database.statementTimeoutMs },
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
