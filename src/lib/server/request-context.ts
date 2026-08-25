import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = { userId: string | null };

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
	return storage.run(ctx, fn);
}

export function currentUserId(): string | null {
	return storage.getStore()?.userId ?? null;
}
