#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Issue #655 behavioral probe. Logs in at 390x844, opens /invoices and drives
 * the mobile chip strip against the live server, reporting for each step the
 * URL search string, the rendered invoice-card count, and the presence of the
 * load-more / export controls. Run against the base tree it documents the
 * inert chips and page-1-only filtering; against the fix it proves the chips
 * drive server filters and page 2 is reachable.
 *
 * Usage: BASE_URL=http://127.0.0.1:5255 node scripts/655-chip-probe.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5255';
const EMAIL = process.env.AUDIT_EMAIL || 'test@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD || 'Test1234!';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MOBILE = {
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 1,
	isMobile: true,
	hasTouch: true,
	locale: 'es-ES',
};

const CARD = '.md\\:hidden a[href^="/invoice/"]';

async function state(page, label) {
	await page.waitForTimeout(700);
	const cards = await page.locator(CARD).count();
	const url = new URL(page.url());
	const loadMore = await page.getByRole('button', { name: /cargar más/i }).count();
	const exportLink = await page.locator('.md\\:hidden a[href="/invoices/export"]').count();
	console.log(`${label} | search='${url.search}' cards=${cards} loadMoreBtn=${loadMore} exportLink=${exportLink}`);
	return { cards, search: url.search };
}

async function tapChip(page, name) {
	const chip = page.locator('.md\\:hidden .chip', { hasText: name }).first();
	if (await chip.count() === 0) {
		console.log(`chip '${name}' | NOT PRESENT`);
		return false;
	}
	await chip.click();
	return true;
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await (await browser.newContext(MOBILE)).newPage();
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
	page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
	page.click('button[type="submit"]'),
]);

await page.goto(BASE + '/invoices', { waitUntil: 'networkidle' });
const base = await state(page, 'initial (no filter)');

if (await tapChip(page, 'Por proveedor')) {
	const sheet = page.locator('[role="dialog"]');
	if (await sheet.count() > 0) {
		console.log('supplier chip | opened sheet with options:', await sheet.locator('.filter-sheet-option').count());
		await sheet.locator('.filter-sheet-option', { hasText: 'Proveedor A' }).click();
		await state(page, 'after supplier=Proveedor A');
		await page.goto(BASE + '/invoices', { waitUntil: 'networkidle' });
	} else {
		const after = await state(page, 'after tap Por proveedor');
		console.log(`supplier chip | INERT: no sheet, cards ${base.cards} -> ${after.cards}, search '${base.search}' -> '${after.search}'`);
	}
}

if (await tapChip(page, 'Por categoría')) {
	const sheet = page.locator('[role="dialog"]');
	if (await sheet.count() > 0) {
		console.log('category chip | opened sheet with options:', await sheet.locator('.filter-sheet-option').count());
		await sheet.locator('.filter-sheet-option', { hasText: 'Lácteos' }).click();
		await state(page, 'after category=Lácteos');
		await page.goto(BASE + '/invoices', { waitUntil: 'networkidle' });
	} else {
		const after = await state(page, 'after tap Por categoría');
		console.log(`category chip | INERT: no sheet, cards ${base.cards} -> ${after.cards}, search '${base.search}' -> '${after.search}'`);
	}
}

await tapChip(page, 'Vencidas');
const overdue = await state(page, 'after tap Vencidas');
const serverOverdue = await page.evaluate(async () => {
	const resp = await fetch('/invoices/export', { method: 'HEAD' }).catch(() => null);
	return resp ? 'export-endpoint-reachable' : 'export-endpoint-missing';
});
console.log(`Vencidas | cards=${overdue.cards} (server holds 15 overdue; a page-1-only client filter shows fewer) | ${serverOverdue}`);
const overdueNumbers = await page.locator(CARD + ' .num').allInnerTexts();
console.log('Vencidas | beyond-page-1 invoice X-2026-2021 visible:', overdueNumbers.some(t => t.includes('X-2026-2021')));

await tapChip(page, 'Este mes');
await state(page, 'after tap Este mes');

await page.goto(BASE + '/invoices', { waitUntil: 'networkidle' });
const loadMoreBtn = page.getByRole('button', { name: /cargar más/i });
if (await loadMoreBtn.count() > 0) {
	await loadMoreBtn.click();
	await state(page, 'after Cargar más');
} else {
	console.log('pagination | no Cargar más control on mobile; 75 invoices exist, page 1 caps at 50');
}

await browser.close();
