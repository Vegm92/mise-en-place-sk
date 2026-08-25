import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5253';
const EMAIL = process.env.AUDIT_EMAIL || 'test@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD || 'Test1234!';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || 'shots';
const PREFIX = process.env.PREFIX || '653';

fs.mkdirSync(OUT, { recursive: true });

async function signIn(page) {
	await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await Promise.all([
		page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
		page.click('button[type="submit"]'),
	]);
	await page.waitForTimeout(1000);
}

const browser = await chromium.launch({ executablePath: CHROME });

const mobile = await (
	await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 1,
		isMobile: true,
		hasTouch: true,
		locale: 'es-ES',
	})
).newPage();
await signIn(mobile);
await mobile.goto(BASE + '/budgets', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: `${OUT}/${PREFIX}-mobile-default.png`, fullPage: false });

const toggle = mobile.locator('button[aria-expanded]');
if ((await toggle.count()) > 0) {
	await toggle.scrollIntoViewIfNeeded();
	await mobile.screenshot({ path: `${OUT}/${PREFIX}-mobile-disclosure-collapsed.png` });
	await toggle.click();
	await mobile.waitForTimeout(400);
	await mobile.screenshot({ path: `${OUT}/${PREFIX}-mobile-disclosure-expanded.png` });
	const firstHiddenInput = mobile.locator('input[id^="budget-"]:visible').nth(6);
	await firstHiddenInput.scrollIntoViewIfNeeded();
	await firstHiddenInput.fill('120');
	await firstHiddenInput.focus();
	await mobile.waitForTimeout(300);
	await mobile.screenshot({ path: `${OUT}/${PREFIX}-mobile-disclosure-input-focused.png` });
	const metrics = await firstHiddenInput.evaluate((el) => {
		const r = el.getBoundingClientRect();
		return { height: Math.round(r.height), fontSize: getComputedStyle(el).fontSize, value: el.value, name: el.name };
	});
	console.log('disclosure input:', JSON.stringify(metrics));
	await toggle.click();
	await mobile.waitForTimeout(300);
	const kept = await mobile.evaluate((name) => {
		const el = [...document.querySelectorAll('input[id^="budget-"]')].find((i) => i.name === name);
		return { value: el.value, visible: el.getBoundingClientRect().height > 0 };
	}, metrics.name);
	console.log('after collapse, value kept:', JSON.stringify(kept));
}

const bottom = await mobile.evaluate(() => {
	const mobileRoot = [...document.querySelectorAll('div')].find(
		(d) => (d.getAttribute('class') || '').includes('md:hidden')
	);
	const scroller = mobileRoot.querySelector('form > div');
	scroller.scrollTop = scroller.scrollHeight;
	const cards = [...mobileRoot.querySelectorAll('.card')].filter((c) => c.getBoundingClientRect().height > 0);
	const last = cards[cards.length - 1].getBoundingClientRect();
	const sticky = mobileRoot.querySelector('button[type="submit"]')?.closest('div')?.getBoundingClientRect();
	return { lastCardBottom: Math.round(last.bottom), stickyTop: sticky ? Math.round(sticky.top) : null };
});
console.log('scrolled to bottom:', JSON.stringify(bottom));
await mobile.screenshot({ path: `${OUT}/${PREFIX}-mobile-bottom.png` });

const desktop = await (
	await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-ES' })
).newPage();
await signIn(desktop);
await desktop.goto(BASE + '/budgets', { waitUntil: 'networkidle' });
await desktop.waitForTimeout(900);
await desktop.screenshot({ path: `${OUT}/${PREFIX}-desktop-1440.png` });

await browser.close();
console.log('done');
