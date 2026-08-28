import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { ReservedSql } from 'postgres';
import * as schema from './schema';
import { getClient, type DB } from './db';

export interface TenantContext {
	mode: 'tenant' | 'admin';
	restaurantId: string | null;
	db: DB;
}

interface ActiveContext extends TenantContext {
	reserved: ReservedSql;
}

const als = new AsyncLocalStorage<ActiveContext>();

export function activeTenantContext(): TenantContext | undefined {
	return als.getStore();
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
	(reserved as unknown as { options?: unknown }).options ??= (getClient() as unknown as { options: unknown }).options;
	try {
		if (mode === 'tenant') {
			await reserved`SELECT set_config('app.restaurant_id', ${restaurantId}, false), set_config('app.admin', '', false)`;
		} else {
			await reserved`SELECT set_config('app.admin', 'true', false), set_config('app.restaurant_id', '', false)`;
		}
		const ctxDb = drizzle(reserved, { schema });
		return await als.run({ mode, restaurantId, reserved, db: ctxDb }, fn);
	} finally {
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
