import { error } from '@sveltejs/kit';

export async function handleLoad<T>(label: string, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error(`[${label}] load failed`, e);
		throw error(500, `Failed to load ${label}`);
	}
}
