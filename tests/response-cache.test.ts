import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
	PRIVATE_CACHE_CONTROL,
	applyPrivateCacheHeaders,
	isPubliclyCacheable,
	withVaryField,
} from '../src/lib/server/response-cache';

/**
 * Every routed response used to ship with no Cache-Control at all, and only
 * whatever Vary the edge added (accept-encoding). /suppliers is per-tenant and
 * rotates __Secure-authjs.session-token on the way out, so a shared cache that
 * keyed on the URL alone could hand one tenant's rendered page — and its
 * Set-Cookie — to another. Railway's edge already attaches an ETag and an
 * x-sveltekit-page marker to these responses, so something upstream is looking
 * at them.
 *
 * Routes that deliberately serve public bytes (robots.txt, sitemap.xml) declare
 * their own Cache-Control and must keep it, and must NOT gain Vary: Cookie —
 * that would shard a public cache per session cookie.
 */
function headersWith(init: Record<string, string>): Headers {
	return new Headers(init);
}

describe('isPubliclyCacheable', () => {
	it('matches a public directive wherever it appears in the list', () => {
		expect(isPubliclyCacheable('public, max-age=86400')).toBe(true);
		expect(isPubliclyCacheable('max-age=60, public')).toBe(true);
		expect(isPubliclyCacheable('PUBLIC')).toBe(true);
	});

	it('does not match private or absent policies', () => {
		expect(isPubliclyCacheable(null)).toBe(false);
		expect(isPubliclyCacheable('private, no-store')).toBe(false);
		expect(isPubliclyCacheable('no-cache')).toBe(false);
	});
});

describe('withVaryField', () => {
	it('seeds Vary when the response has none', () => {
		expect(withVaryField(null, 'Cookie')).toBe('Cookie');
	});

	it('appends without dropping fields the response already declared', () => {
		expect(withVaryField('Accept-Encoding', 'Cookie')).toBe('Accept-Encoding, Cookie');
	});

	it('reports no change when the field is already covered', () => {
		expect(withVaryField('accept-encoding, cookie', 'Cookie')).toBeNull();
		expect(withVaryField('*', 'Cookie')).toBeNull();
	});
});

describe('applyPrivateCacheHeaders', () => {
	it('locks down a routed response that declared nothing', () => {
		const headers = headersWith({});
		applyPrivateCacheHeaders(headers);
		expect(headers.get('Cache-Control')).toBe(PRIVATE_CACHE_CONTROL);
		expect(headers.get('Vary')).toBe('Cookie');
	});

	it('leaves a route that already declared private bytes alone but still varies on Cookie', () => {
		const headers = headersWith({ 'Cache-Control': 'private, no-store' });
		applyPrivateCacheHeaders(headers);
		expect(headers.get('Cache-Control')).toBe('private, no-store');
		expect(headers.get('Vary')).toBe('Cookie');
	});

	it('never downgrades or shards a deliberately public route', () => {
		const headers = headersWith({ 'Cache-Control': 'public, max-age=86400' });
		applyPrivateCacheHeaders(headers);
		expect(headers.get('Cache-Control')).toBe('public, max-age=86400');
		expect(headers.get('Vary')).toBeNull();
	});

	it('preserves a Vary the response set for itself', () => {
		const headers = headersWith({ Vary: 'Accept-Encoding' });
		applyPrivateCacheHeaders(headers);
		expect(headers.get('Vary')).toBe('Accept-Encoding, Cookie');
	});

	it('is idempotent, so a second pass cannot duplicate Cookie', () => {
		const headers = headersWith({});
		applyPrivateCacheHeaders(headers);
		applyPrivateCacheHeaders(headers);
		expect(headers.get('Vary')).toBe('Cookie');
	});
});

describe('the policy is wired into the request pipeline', () => {
	const hooks = fs.readFileSync(path.join(process.cwd(), 'src', 'hooks.server.ts'), 'utf8');

	it('applies to responses in appHandle', () => {
		expect(hooks).toContain("import { applyPrivateCacheHeaders } from '$lib/server/response-cache'");
		expect(hooks).toContain('applyPrivateCacheHeaders(response.headers)');
	});

	it('only touches responses a route produced, so static assets keep their own caching', () => {
		expect(hooks).toContain('if (event.route.id !== null) applyPrivateCacheHeaders(response.headers)');
	});
});

describe('the public-route exemption is exercised by real routes', () => {
	it.each([
		'src/routes/robots.txt/+server.ts',
		'src/routes/sitemap.xml/+server.ts',
	])('%s still declares its own public policy', (file) => {
		const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
		expect(source).toContain("'Cache-Control': 'public, max-age=86400'");
	});
});
