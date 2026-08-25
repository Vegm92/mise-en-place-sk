import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5254';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' };
const DESKTOP = { viewport: { width: 1440, height: 900 }, locale: 'es-ES' };

async function login(page, email) {
	await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
	await page.fill('input[name="email"]', email);
	await page.fill('input[name="password"]', 'Test1234!');
	await Promise.all([
		page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
		page.click('button[type="submit"]'),
	]);
	await page.waitForTimeout(1200);
}

async function shot(page, route, file, fullPage = false) {
	await page.goto(BASE + route, { waitUntil: 'networkidle' });
	await page.waitForTimeout(900);
	await page.screenshot({ path: 'shots/' + file, fullPage });
	console.log('saved', file);
}

const browser = await chromium.launch({ executablePath: CHROME });

const m = await (await browser.newContext(MOBILE)).newPage();
await login(m, 'test@example.com');
await shot(m, '/analytics/spend', '654-spend-mobile-data.png', true);
await shot(m, '/analytics/prices', '654-prices-mobile-data.png');
await shot(m, '/analytics/extraction', '654-extraction-mobile-data.png', true);
await m.context().close();

const me = await (await browser.newContext(MOBILE)).newPage();
await login(me, '654-empty@example.com');
await shot(me, '/analytics/spend', '654-spend-mobile-empty.png', true);
await shot(me, '/analytics/prices', '654-prices-mobile-empty.png', true);
await shot(me, '/analytics/extraction', '654-extraction-mobile-empty.png', true);
await me.context().close();

const d = await (await browser.newContext(DESKTOP)).newPage();
await login(d, 'test@example.com');
await shot(d, '/analytics/spend', '654-spend-desktop-1440.png');
await shot(d, '/analytics/prices', '654-prices-desktop-1440.png');
await shot(d, '/analytics/extraction', '654-extraction-desktop-1440.png');
await d.context().close();

await browser.close();
