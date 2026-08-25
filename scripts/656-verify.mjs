import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5256';
const EMAIL = 'test@example.com';
const PASSWORD = 'Test1234!';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MOBILE = {
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 1,
	isMobile: true,
	hasTouch: true,
	locale: 'es-ES',
	userAgent:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-ES' };

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

fs.mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const mobile = await (await browser.newContext(MOBILE)).newPage();
await signIn(mobile);
await mobile.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(600);

const dismissTour = mobile.locator('button', { hasText: 'No, gracias' });
if (await dismissTour.count()) {
	await dismissTour.first().click();
	await mobile.waitForTimeout(300);
}

const mobileRoot = mobile.locator('.md\\:hidden');
const trendCard = mobileRoot.locator('.card', { has: mobile.locator('.period-track') }).first();

const readTrend = async () => {
	const txt = (await trendCard.innerText()).replace(/\s+/g, ' ').trim();
	return txt;
};

const greeting = await mobile.evaluate(() => {
	const els = [...document.querySelectorAll('.md\\:hidden div')];
	const el = els.find((e) => /Buen[oa]s? .* de /.test(e.textContent || '') && e.children.length === 0);
	if (!el) return null;
	return {
		text: (el.textContent || '').trim(),
		scrollWidth: el.scrollWidth,
		clientWidth: el.clientWidth,
		whiteSpace: getComputedStyle(el).whiteSpace,
	};
});
console.log('GREETING:', JSON.stringify(greeting));

const pills = await mobileRoot.locator('.period-pill').evaluateAll((els) =>
	els.map((e) => {
		const r = e.getBoundingClientRect();
		return { label: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
	}),
);
console.log('PILLS:', JSON.stringify(pills));

console.log('TREND default:', await readTrend());
await mobile.screenshot({ path: 'shots/656-mobile-default.png', fullPage: false });

await mobileRoot.locator('.period-pill', { hasText: /^Día$/ }).click();
await mobile.waitForTimeout(1200);
console.log('TREND after Dia:', await readTrend());
await mobile.screenshot({ path: 'shots/656-mobile-gran-dia.png', fullPage: false });

await mobileRoot.locator('.period-pill', { hasText: /^90d$/ }).click();
await mobile.waitForTimeout(1200);
console.log('TREND after 90d:', await readTrend());
await mobile.screenshot({ path: 'shots/656-mobile-90d.png', fullPage: false });

const alertsLink = mobileRoot.locator('a[href="/reminders"]');
const alertsCount = await alertsLink.count();
console.log('ALERTS strip present:', alertsCount > 0);
if (alertsCount > 0) {
	await alertsLink.first().scrollIntoViewIfNeeded();
	console.log('ALERTS strip text:', (await alertsLink.first().innerText()).replace(/\s+/g, ' ').trim());
	await mobile.screenshot({ path: 'shots/656-mobile-alerts-strip.png', fullPage: false });
	await alertsLink.first().click();
	await mobile.waitForURL('**/reminders', { timeout: 15000 });
	await mobile.waitForTimeout(800);
	console.log('AFTER TAP url:', mobile.url());
	await mobile.screenshot({ path: 'shots/656-mobile-reminders.png', fullPage: false });
}

await mobile.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
await mobile.waitForTimeout(400);
const budget = await mobile.evaluate(() => {
	const acc = [];
	const walk = (el) => {
		for (const node of el.childNodes) {
			if (node.nodeType === 3) {
				const t = node.textContent.trim();
				if (t) acc.push(t);
			} else if (node.nodeType === 1) {
				const cs = getComputedStyle(node);
				if (cs.display === 'none' || cs.visibility === 'hidden') continue;
				walk(node);
			}
		}
	};
	walk(document.querySelector('main') || document.body);
	const text = acc.join(' ');
	const i = text.indexOf('Presupuesto del mes');
	return i >= 0 ? text.slice(i, i + 60) : null;
});
console.log('BUDGET usado figure:', JSON.stringify(budget));

const desktop = await (await browser.newContext(DESKTOP)).newPage();
await signIn(desktop);
await desktop.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
await desktop.waitForTimeout(800);
await desktop.screenshot({ path: 'shots/656-desktop-1440.png', fullPage: false });
console.log('desktop shot saved');

await browser.close();
