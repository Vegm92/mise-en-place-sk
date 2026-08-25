import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5251';
const EMAIL = process.env.AUDIT_EMAIL || 'test@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD || 'Test1234!';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: CHROME });
const page = await (await browser.newContext({
	viewport: { width: 390, height: 844 },
	isMobile: true,
	hasTouch: true,
	locale: 'es-ES',
})).newPage();
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
	page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
	page.click('button[type="submit"]'),
]);
await page.goto(BASE + '/products', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(900);
const fields = await page.evaluate(() => {
	const out = [];
	for (const el of document.querySelectorAll('form[action="?/create"] input, form[action="?/create"] select, form[action="?/create"] button')) {
		const r = el.getBoundingClientRect();
		const cs = getComputedStyle(el);
		out.push({ id: el.id || el.type || el.tagName, height: Math.round(r.height), fontSize: cs.fontSize });
	}
	return out;
});
console.log(JSON.stringify(fields, null, 2));
await browser.close();
