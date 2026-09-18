import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { ReservedSql } from 'postgres';
import * as schema from './schema';
import { getClient, type DB } from './db-client';

export interface TenantContext {
	mode: 'tenant' | 'admin';
	restaurantId: string | null;
	db: DB;
}

interface ActiveContext extends TenantContext {
	reserved: ReservedSql;
	released: boolean;
}

const als = new AsyncLocalStorage<ActiveContext>();

export function activeTenantContext(): TenantContext | undefined {
	const ctx = als.getStore();
	if (ctx?.released) {
		throw new Error(
			'[tenant-context] query attempted after the tenant scope released its connection; ' +
			'await the work inside the scope or start its own scope with runAsSystem/runWithTenantContext',
		);
	}
	return ctx;
}

async function clearGucs(reserved: ReservedSql): Promise<void> {
	await reserved`SELECT set_config('app.restaurant_id', '', false), set_config('app.admin', '', false)`;
}

async function withReservedContext<T>(
	mode: 'tenant' | 'admin',
	restaurantId: string | null,
	fn: () => Promise<T>,
): Promise<T> {
	const reserved = await getClient().reserve();
	let active: ActiveContext | undefined;
	(reserved as unknown as { options?: unknown }).options ??= (getClient() as unknown as { options: unknown }).options;
	type BeginFn = (fn: (sql: ReservedSql) => Promise<unknown>) => Promise<unknown>;
	(reserved as unknown as { begin?: BeginFn }).begin ??= async (fn) => {
		await reserved`BEGIN`;
		try {
			const result = await fn(reserved);
			await reserved`COMMIT`;
			return result;
		} catch (err) {
			await reserved`ROLLBACK`;
			throw err;
		}
	};
	try {
		if (mode === 'tenant') {
			await reserved`SELECT set_config('app.restaurant_id', ${restaurantId}, false), set_config('app.admin', '', false)`;
		} else {
			await reserved`SELECT set_config('app.admin', 'true', false), set_config('app.restaurant_id', '', false)`;
		}
		const ctxDb = drizzle(reserved, { schema });
		active = { mode, restaurantId, reserved, db: ctxDb, released: false };
		return await als.run(active, fn);
	} finally {
		if (active) active.released = true;
		try {
			await clearGucs(reserved);
		} catch (err) {
			console.error('[tenant-context] failed to reset session GUCs before releasing connection:', err);
		} finally {
			reserved.release();
		}
	}
}

export async function runWithTenantContext<T>(
	restaurantId: string | null | undefined,
	fn: () => Promise<T>,
): Promise<T> {
	if (!restaurantId) return fn();
	return withReservedContext('tenant', restaurantId, fn);
}

export async function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
	return withReservedContext('admin', null, fn);
}
