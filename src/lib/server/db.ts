import { activeTenantContext } from './tenant-context';
import { getDb, getClient, type DB } from './db-client';

export type { DB } from './db-client';

export const db: DB = new Proxy({} as DB, {
	get(_target, prop) {
		const real = activeTenantContext()?.db ?? getDb();
		const value = Reflect.get(real as object, prop, real);
		return typeof value === 'function' ? value.bind(real) : value;
	}
});

export { getDb, getClient };

export { forTenant } from './tenant';
export { runWithTenantContext, runAsSystem, activeTenantContext } from './tenant-context';
