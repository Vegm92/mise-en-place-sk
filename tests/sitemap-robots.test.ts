/**
 * sitemap.xml + robots.txt — issue #327.
 *
 * The variant landing pages must be discoverable: sitemap.xml enumerates
 * them dynamically off the same registry the routes themselves resolve
 * against (so a new variant never needs a second hand-maintained list), and
 * carries the previously-missing /signup entry; robots.txt explicitly
 * allows /l/ rather than relying on it merely not being disallowed.
 */
import { describe, it, expect } from 'vitest';
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
