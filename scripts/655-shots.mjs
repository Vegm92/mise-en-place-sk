#!/usr/bin/env node
/* eslint-disable no-console */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5255';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'es-ES' };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-ES' };

fs.mkdirSync('shots', { recursive: true });

async function signIn(page) {
	await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
	await page.fill('input[name="email"]', 'test@example.com');
	await page.fill('input[name="password"]', 'Test1234!');
	await Promise.all([
		page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
		page.click('button[type="submit"]'),
	]);
}

const browser = await chromium.launch({ executablePath: CHROME });
const mob = await (await browser.newContext(MOBILE)).newPage();
await signIn(mob);

await mob.goto(BASE + '/invoices?status=overdue', { waitUntil: 'networkidle' });
await mob.waitForTimeout(800);
console.log('overdue filter url:', mob.url());
await mob.screenshot({ path: 'shots/655-mobile-overdue-filter.png' });

await mob.locator('.md\\:hidden .chip', { hasText: 'Por proveedor' }).click();
await mob.waitForTimeout(400);
await mob.screenshot({ path: 'shots/655-mobile-supplier-sheet.png' });
await mob.keyboard.press('Escape');
await mob.locator('.filter-sheet-head .btn').click().catch(() => {});

await mob.goto(BASE + '/invoices', { waitUntil: 'networkidle' });
await mob.locator('.md\\:hidden .chip', { hasText: 'Por categoría' }).click();
await mob.waitForTimeout(400);
await mob.screenshot({ path: 'shots/655-mobile-category-sheet.png' });
await mob.locator('.filter-sheet-head .btn').click();

await mob.locator('.scroll-strip').evaluate(el => { el.scrollLeft = el.scrollWidth; });
await mob.waitForTimeout(300);
await mob.screenshot({ path: 'shots/655-mobile-export-chip.png' });

await mob.locator('.scroll-strip').evaluate(el => { el.scrollLeft = 0; });
const before = await mob.locator('.md\\:hidden a[href^="/invoice/"]').count();
await mob.getByRole('button', { name: /cargar más/i }).scrollIntoViewIfNeeded();
await mob.getByRole('button', { name: /cargar más/i }).click();
await mob.waitForTimeout(1200);
const after = await mob.locator('.md\\:hidden a[href^="/invoice/"]').count();
console.log(`cargar más: cards ${before} -> ${after}, url ${mob.url()}`);
await mob.screenshot({ path: 'shots/655-mobile-loadmore.png' });

const desk = await (await browser.newContext(DESKTOP)).newPage();
await signIn(desk);
await desk.goto(BASE + '/invoices', { waitUntil: 'networkidle' });
await desk.waitForTimeout(800);
await desk.screenshot({ path: 'shots/655-desktop-invoices.png' });

console.log('shots written');
await browser.close();
