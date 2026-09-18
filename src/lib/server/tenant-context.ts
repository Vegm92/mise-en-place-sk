import { AsyncLocalStorage } from 'node:async_hooks';
import * as Sentry from '@sentry/sveltekit';
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

export class TenantScopeReleasedError extends Error {
	constructor(mode: TenantContext['mode'], restaurantId: string | null) {
		super(`query refused: the ${mode} scope${restaurantId ? ` for ${restaurantId}` : ''} already released its connection (#1073)`);
		this.name = 'TenantScopeReleasedError';
	}
}

const als = new AsyncLocalStorage<ActiveContext>();

export function activeTenantContext(): TenantContext | undefined {
	return als.getStore();
}

async function clearGucs(reserved: ReservedSql): Promise<void> {
	await reserved`SELECT set_config('app.restaurant_id', '', false), set_config('app.admin', '', false)`;
}

function refuseAfterRelease(ctx: ActiveContext): void {
	if (!ctx.released) return;
	const err = new TenantScopeReleasedError(ctx.mode, ctx.restaurantId);
	console.error('[tenant-context]', err.message);
	Sentry.captureException(err);
	throw err;
}

type BeginFn = (fn: (sql: ReservedSql) => Promise<unknown>) => Promise<unknown>;
type UnsafeFn = (...args: unknown[]) => unknown;

function guardReserved(reserved: ReservedSql, ctx: ActiveContext): void {
	const patched = reserved as unknown as { options?: unknown; unsafe: UnsafeFn; begin?: BeginFn };
	patched.options ??= (getClient() as unknown as { options: unknown }).options;
	const unsafe = patched.unsafe;
	patched.unsafe = (...args) => {
		refuseAfterRelease(ctx);
		return unsafe(...args);
	};
	patched.begin ??= async (fn) => {
		refuseAfterRelease(ctx);
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
}

async function withReservedContext<T>(
	mode: 'tenant' | 'admin',
	restaurantId: string | null,
	fn: () => Promise<T>,
): Promise<T> {
	const reserved = await getClient().reserve();
	const ctx: ActiveContext = { mode, restaurantId, reserved, released: false, db: undefined as unknown as DB };
	guardReserved(reserved, ctx);
	try {
		if (mode === 'tenant') {
			await reserved`SELECT set_config('app.restaurant_id', ${restaurantId}, false), set_config('app.admin', '', false)`;
		} else {
			await reserved`SELECT set_config('app.admin', 'true', false), set_config('app.restaurant_id', '', false)`;
		}
		ctx.db = drizzle(reserved, { schema });
		return await als.run(ctx, fn);
	} finally {
		ctx.released = true;
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

export function runDetached<T>(restaurantId: string | null, fn: () => Promise<T>): Promise<T> {
	if (!als.getStore()) return fn();
	return restaurantId
		? withReservedContext('tenant', restaurantId, fn)
		: withReservedContext('admin', null, fn);
}
