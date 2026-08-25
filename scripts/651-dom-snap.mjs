import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5251';
const OUT = process.env.OUT || 'mobile-audit/651-domsnap';
const EMAIL = process.env.AUDIT_EMAIL || 'test@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD || 'Test1234!';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROUTES = (process.env.ROUTES || '/invoices,/suppliers').split(',').map(r => r.trim()).filter(Boolean);

const VIEWPORTS = [
	{ name: 'm390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' },
	{ name: 'd1440', viewport: { width: 1440, height: 900 }, locale: 'es-ES' },
];

async function signIn(page) {
	await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await Promise.all([
		page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
		page.click('button[type="submit"]'),
	]);
	await page.waitForTimeout(800);
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
for (const vp of VIEWPORTS) {
	const page = await (await browser.newContext(vp)).newPage();
	await signIn(page);
	for (const route of ROUTES) {
		const name = route.replace(/^\//, '').replace(/\//g, '_') + '.' + vp.name;
		await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(900);
		const html = await page.evaluate(() => {
			const main = document.querySelector('main') || document.body;
			return main.outerHTML.replace(/\s+/g, ' ');
		});
		fs.writeFileSync(path.join(OUT, name + '.html'), html);
		console.log(name, 'bytes', html.length);
	}
	await page.close();
}
await browser.close();
