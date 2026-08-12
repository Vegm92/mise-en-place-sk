import { error } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { withTimeout } from './with-timeout';

const SAFE_TIMEOUT_MS = parseInt(process.env['LOAD_BLOCK_TIMEOUT_MS'] ?? '8000', 10);

export async function handleLoad<T>(label: string, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error(`[${label}] load failed`, e);
		throw error(500, `Failed to load ${label}`);
	}
}

export async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await withTimeout(label, SAFE_TIMEOUT_MS, fn);
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error(`[${label}] degraded`, e);
		Sentry.captureException(e, { tags: { degraded: label } });
		return fallback;
	}
}
