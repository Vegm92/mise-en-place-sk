#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Cookie banner overlap audit.
 *
 * With the consent banner still showing on a 390x844 phone, a primary CTA must
 * not intersect the banner's bounding box. Exits 1 on overlap.
 *
 * Upload mode (--image): the "Extraer datos" button on the app upload screen.
 * Route mode (--routes=/a,/b): every visible submit button on each route (pages
 * outside the app shell scroll as a document), measured after scrolling to the
 * bottom of the page. --anon skips the login (public pages).
 *
 * Usage:
 *   npx vite dev --port 5198 --host 127.0.0.1 &
 *   node scripts/cookie-banner-cta-audit.mjs --image=<path to a jpg > 1 KB>
 *   node scripts/cookie-banner-cta-audit.mjs --routes=/onboarding?preview=1
 *   node scripts/cookie-banner-cta-audit.mjs --anon --routes=/login,/signup
 *
 * Flags: --base-url (default http://127.0.0.1:5198), --email, --password,
 *        --chrome=<path to a chromium binary>, --width (390), --height (844), --simulate-overlap (proves the check
 *        fails when the banner height is not reserved).
 */
import { chromium } from 'playwright';

const arg = (name, fallback) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
};

const baseUrl = arg('base-url', 'http://127.0.0.1:5198');
const email = arg('email', 'test@example.com');
const password = arg('password', 'Test1234!');
const width = Number(arg('width', '390'));
const height = Number(arg('height', '844'));
const image = arg('image', '');
const chrome = arg('chrome', '');
const simulateOverlap = process.argv.includes('--simulate-overlap');

const routes = arg('routes', '').split(',').filter(Boolean);
const anon = process.argv.includes('--anon');

if (!image && routes.length === 0) {
	console.error('--image=<path to a jpg> or --routes=/a,/b is required');
	process.exit(2);
}

export function rectsOverlap(a, b) {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function login(page) {
	await page.goto(`${baseUrl}/login`);
	await page.fill('input[type=email]', email);
	await page.fill('input[type=password]', password);
	await page.click('button[type=submit]');
	await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}

async function auditUpload(page, banner) {
	await page.goto(`${baseUrl}/`);
	await page.waitForLoadState('networkidle');
	await banner.waitFor({ state: 'visible', timeout: 10000 });
	await page.locator('input[type=file]:not([capture]):not([webkitdirectory])').first().setInputFiles(image);
	const cta = page.locator('.md\\:hidden').getByRole('button', { name: /extraer datos|extract data/i }).first();
	await cta.waitFor({ state: 'visible', timeout: 10000 });
	if (simulateOverlap) await page.evaluate(() => document.documentElement.style.setProperty('--mep-cookie-h', '0px'));
	await page.waitForTimeout(300);
	const bannerBox = await banner.boundingBox();
	const ctaBox = await cta.boundingBox();
	return [{ route: '/', label: 'extract', strict: true, banner: bannerBox, cta: ctaBox }];
}

async function auditRoute(page, banner, route) {
	await page.goto(`${baseUrl}${route}`);
	await page.waitForLoadState('networkidle');
	await banner.waitFor({ state: 'visible', timeout: 10000 });
	if (simulateOverlap) await page.evaluate(() => document.documentElement.style.setProperty('--mep-cookie-h', '0px'));
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await page.waitForTimeout(300);
	const bannerBox = await banner.boundingBox();
	const out = [];
	for (const el of await page.locator('button[type=submit]:visible:not(.mep-cookie-banner *)').all()) {
		const label = ((await el.innerText()) || '').trim().slice(0, 40);
		out.push({ route, label, banner: bannerBox, cta: await el.boundingBox() });
	}
	if (out.length === 0) out.push({ route, label: '(no submit button found)', banner: bannerBox, cta: null });
	return out;
}

const browser = await chromium.launch(chrome ? { executablePath: chrome } : {});
let failed = false;
try {
	const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
	const page = await ctx.newPage();
	if (!anon) await login(page);
	await ctx.clearCookies({ name: 'mep_consent' });
	const banner = page.locator('.mep-cookie-banner');
	const results = image ? await auditUpload(page, banner) : [];
	for (const route of routes) results.push(...(await auditRoute(page, banner, route)));
	for (const r of results) {
		const overlap = !r.cta || rectsOverlap(r.cta, r.banner);
		const inViewport = !!r.cta && r.cta.y >= 0 && r.cta.y + r.cta.height <= height;
		if (overlap || (r.strict && !inViewport)) failed = true;
		console.log(JSON.stringify({ viewport: { width, height }, ...r, overlap, inViewport, simulateOverlap }));
	}
} finally {
	await browser.close();
}
process.exit(failed ? 1 : 0);
