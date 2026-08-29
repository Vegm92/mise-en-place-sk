/**
 * sitemap.xml + robots.txt — issue #327.
 *
 * The variant landing pages must be discoverable: sitemap.xml enumerates
 * them dynamically off the same registry the routes themselves resolve
 * against (so a new variant never needs a second hand-maintained list), and
 * carries the previously-missing /signup entry; robots.txt explicitly
 * allows /l/ rather than relying on it merely not being disallowed.
 *
 * Extended by GEO Phase 1, which added three guarantees worth pinning:
 *
 *   1. Both routes emit APP_BASE_URL, not the request's own origin, so an
 *      apex/app host split cannot have each host declare itself canonical.
 *   2. <lastmod> is a per-route constant, not `new Date()` evaluated per
 *      request. The old code told every crawler that all eleven pages changed
 *      today, every day — a trust signal spent for nothing.
 *   3. robots.txt keeps ONE `User-agent: *` group. A crawler obeys only the
 *      most specific group matching it and ignores `User-agent: *` once it has
 *      its own, so a per-agent `Allow:` block would silently hand that agent
 *      the entire authenticated surface. The test below fails if a second
 *      group appears without the full disallow list repeated into it.
 */
import { describe, it, expect, vi } from 'vitest';
import { GET as sitemapGet } from '../src/routes/sitemap.xml/+server';
import { GET as robotsGet } from '../src/routes/robots.txt/+server';
import { landingVariantSlugs } from '../src/lib/landing-variants';

function fakeEvent(origin: string) {
	return { url: new URL(`${origin}/sitemap.xml`) } as never;
}

describe('sitemap.xml', () => {
	it('lists every landing variant under /l/<slug>', async () => {
		const res = await sitemapGet(fakeEvent('https://mise-en-place.app'));
		const xml = await res.text();
		const slugs = landingVariantSlugs();
		expect(slugs.length).toBeGreaterThan(0);
		for (const slug of slugs) {
			expect(xml).toContain(`<loc>https://mise-en-place.app/l/${slug}</loc>`);
		}
	});

	it('lists /signup', async () => {
		const res = await sitemapGet(fakeEvent('https://mise-en-place.app'));
		const xml = await res.text();
		expect(xml).toContain('<loc>https://mise-en-place.app/signup</loc>');
	});

	it('still lists the base /waitlist page', async () => {
		const res = await sitemapGet(fakeEvent('https://mise-en-place.app'));
		const xml = await res.text();
		expect(xml).toContain('<loc>https://mise-en-place.app/waitlist</loc>');
	});

	it('produces exactly one <url> entry per registered route (no duplicates)', async () => {
		const res = await sitemapGet(fakeEvent('https://mise-en-place.app'));
		const xml = await res.text();
		const urlCount = (xml.match(/<url>/g) ?? []).length;
		const locCount = new Set(xml.match(/<loc>[^<]+<\/loc>/g)).size;
		expect(locCount).toBe(urlCount);
	});
});

describe('robots.txt', () => {
	it('explicitly allows /l/', async () => {
		const res = await robotsGet({ url: new URL('https://mise-en-place.app/robots.txt') } as never);
		const body = await res.text();
		expect(body).toContain('Allow: /l/');
	});

	it('still disallows the authenticated app surface', async () => {
		const res = await robotsGet({ url: new URL('https://mise-en-place.app/robots.txt') } as never);
		const body = await res.text();
		expect(body).toContain('Disallow: /dashboard');
		expect(body).toContain('Disallow: /invoices');
	});

	it('disallows /s/ (issue #329 digest/alert share links) while keeping Allow: /l/', async () => {
		const res = await robotsGet({ url: new URL('https://mise-en-place.app/robots.txt') } as never);
		const body = await res.text();
		expect(body).toContain('Disallow: /s/');
		expect(body).toContain('Allow: /l/');
	});
});


describe('sitemap.xml lastmod is real, not request time', () => {
	async function lastmods(): Promise<string[]> {
		const res = await sitemapGet(fakeEvent('https://mise-en-place.app'));
		const xml = await res.text();
		return [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
	}

	it('emits one lastmod per url entry', async () => {
		const res = await sitemapGet(fakeEvent('https://mise-en-place.app'));
		const xml = await res.text();
		const urlCount = (xml.match(/<url>/g) ?? []).length;
		expect((await lastmods()).length).toBe(urlCount);
	});

	it('every lastmod is a valid ISO date, not in the future', async () => {
		const today = new Date().toISOString().split('T')[0];
		for (const value of await lastmods()) {
			expect(value, `${value} should be YYYY-MM-DD`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(value.localeCompare(today), `${value} is in the future`).toBeLessThanOrEqual(0);
		}
	});

	it('dates differ per route — proving they are declared, not stamped at request time', async () => {
		expect(new Set(await lastmods()).size).toBeGreaterThan(1);
	});
});

describe('robots.txt keeps a single user-agent group', () => {
	async function body(): Promise<string> {
		const res = await robotsGet({ url: new URL('https://mise-en-place.app/robots.txt') } as never);
		return res.text();
	}

	it('declares exactly one User-agent group, and it is the wildcard', async () => {
		const agents = [...(await body()).matchAll(/^User-agent:\s*(.+)$/gm)].map((m) => m[1].trim());
		expect(agents).toEqual(['*']);
	});

	it('disallows the authenticated surface that a per-agent group would have exposed', async () => {
		const text = await body();
		for (const path of ['/dashboard', '/invoices', '/api/', '/admin/', '/s/', '/settings', '/billing']) {
			expect(text, `robots.txt should disallow ${path}`).toContain(`Disallow: ${path}`);
		}
	});

	it('explains the single-group constraint in the body, so it is not undone by accident', async () => {
		expect(await body()).toMatch(/most specific group/i);
	});
});

describe('both routes use the configured origin, not the request host', () => {
	const CONFIGURED = 'https://mise-place.com';
	const REQUEST_HOST = 'https://someone-elses-host.example';

	async function withConfiguredOrigin<T>(value: string, run: (mod: {
		sitemapGet: typeof sitemapGet;
		robotsGet: typeof robotsGet;
	}) => Promise<T>): Promise<T> {
		vi.stubEnv('APP_BASE_URL', value);
		vi.resetModules();
		try {
			const sitemap = await import('../src/routes/sitemap.xml/+server');
			const robots = await import('../src/routes/robots.txt/+server');
			return await run({ sitemapGet: sitemap.GET, robotsGet: robots.GET });
		} finally {
			vi.unstubAllEnvs();
			vi.resetModules();
		}
	}

	it('sitemap <loc> uses APP_BASE_URL even when another host served the request', async () => {
		const locs = await withConfiguredOrigin(CONFIGURED, async ({ sitemapGet: get }) => {
			const xml = await (await get(fakeEvent(REQUEST_HOST))).text();
			return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
		});
		expect(locs.length).toBeGreaterThan(0);
		for (const loc of locs) {
			expect(loc.startsWith(`${CONFIGURED}/`), `${loc} should sit on the configured origin`).toBe(true);
		}
		expect(locs.join('\n')).not.toContain(REQUEST_HOST);
	});

	it('robots.txt Sitemap: line uses APP_BASE_URL too', async () => {
		const sitemapLine = await withConfiguredOrigin(CONFIGURED, async ({ robotsGet: get }) => {
			const text = await (await get({ url: new URL(`${REQUEST_HOST}/robots.txt`) } as never)).text();
			return /^Sitemap:\s*(.+)$/m.exec(text)?.[1].trim();
		});
		expect(sitemapLine).toBe(`${CONFIGURED}/sitemap.xml`);
	});

	it('a trailing slash on APP_BASE_URL does not produce a double slash', async () => {
		const locs = await withConfiguredOrigin(`${CONFIGURED}/`, async ({ sitemapGet: get }) => {
			const xml = await (await get(fakeEvent(REQUEST_HOST))).text();
			return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
		});
		for (const loc of locs) {
			expect(loc, `${loc} should not contain a doubled slash`).not.toMatch(/[^:]\/\//);
		}
	});

	it('falls back to the request origin when APP_BASE_URL is unset, so dev and previews still work', async () => {
		const locs = await withConfiguredOrigin('', async ({ sitemapGet: get }) => {
			const xml = await (await get(fakeEvent(REQUEST_HOST))).text();
			return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
		});
		expect(locs.length).toBeGreaterThan(0);
		for (const loc of locs) {
			expect(loc.startsWith(`${REQUEST_HOST}/`)).toBe(true);
		}
	});
});
