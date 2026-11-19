#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Photo intake / cookie banner overlap audit.
 *
 * With the consent banner still showing on a 390x844 phone, the primary
 * "Extraer datos" button on the upload screen must be fully visible and must
 * not intersect the banner's bounding box. Exits 1 on overlap.
 *
 * Usage:
 *   npx vite dev --port 5198 --host 127.0.0.1 &
 *   node scripts/cookie-banner-cta-audit.mjs --image=<path to a jpg > 1 KB>
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

if (!image) {
	console.error('--image=<path to a jpg> is required');
	process.exit(2);
}

export function rectsOverlap(a, b) {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const browser = await chromium.launch(chrome ? { executablePath: chrome } : {});
try {
	const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
	const page = await ctx.newPage();
	await page.goto(`${baseUrl}/login`);
	await page.fill('input[type=email]', email);
	await page.fill('input[type=password]', password);
	await page.click('button[type=submit]');
	await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
	await page.context().clearCookies({ name: 'mep_consent' });
	await page.goto(`${baseUrl}/`);
	await page.waitForLoadState('networkidle');

	const banner = page.locator('.mep-cookie-banner');
	await banner.waitFor({ state: 'visible', timeout: 10000 });
	await page.locator('input[type=file]:not([capture]):not([webkitdirectory])').first().setInputFiles(image);
	const cta = page.locator('.md\\:hidden').getByRole('button', { name: /extraer datos|extract data/i }).first();
	await cta.waitFor({ state: 'visible', timeout: 10000 });

	if (simulateOverlap) {
		await page.evaluate(() => document.documentElement.style.setProperty('--mep-cookie-h', '0px'));
		await page.waitForTimeout(200);
	} else {
		await page.waitForTimeout(300);
	}

	const bannerBox = await banner.boundingBox();
	const ctaBox = await cta.boundingBox();
	const overlap = rectsOverlap(ctaBox, bannerBox);
	const inViewport = ctaBox.y >= 0 && ctaBox.y + ctaBox.height <= height;
	console.log(JSON.stringify({ viewport: { width, height }, banner: bannerBox, cta: ctaBox, overlap, inViewport, simulateOverlap }));
	process.exit(overlap || !inViewport ? 1 : 0);
} finally {
	await browser.close();
}
