export const PRIVATE_CACHE_CONTROL = 'private, no-store';

export function isPubliclyCacheable(cacheControl: string | null): boolean {
	return /(?:^|[\s,])public(?:[\s,;]|$)/i.test(cacheControl ?? '');
}

export function withVaryField(vary: string | null, field: string): string | null {
	const fields = (vary ?? '').split(',').map(f => f.trim()).filter(Boolean);
	const present = fields.map(f => f.toLowerCase());
	if (present.includes('*') || present.includes(field.toLowerCase())) return null;
	return [...fields, field].join(', ');
}

export function applyPrivateCacheHeaders(headers: Headers): void {
	const declared = headers.get('Cache-Control');
	if (!declared) headers.set('Cache-Control', PRIVATE_CACHE_CONTROL);
	if (isPubliclyCacheable(declared)) return;
	const vary = withVaryField(headers.get('Vary'), 'Cookie');
	if (vary) headers.set('Vary', vary);
}
