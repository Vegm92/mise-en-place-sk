import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5251';
const EMAIL = process.env.AUDIT_EMAIL || 'test@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD || 'Test1234!';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TAG = process.env.TAG || 'branch';

fs.mkdirSync('shots', { recursive: true });

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

const browser = await chromium.launch({ executablePath: CHROME });

const mobile = await (await browser.newContext({
	viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES',
})).newPage();
await signIn(mobile);
for (const [route, name] of [
	['/products', 'products'],
	['/plantilla-lista', 'plantilla-lista'],
	['/invoices', 'invoices'],
	['/suppliers', 'suppliers'],
]) {
	await mobile.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
	await mobile.waitForTimeout(900);
	if (name === 'products' || name === 'plantilla-lista') {
		await mobile.evaluate(() => {
			const tbl = document.querySelector('table.tbl');
			if (tbl) tbl.scrollIntoView({ block: 'start' });
		});
		await mobile.waitForTimeout(300);
	}
	await mobile.screenshot({ path: `shots/651-${name}-390-${TAG}.png` });
	console.log(`shots/651-${name}-390-${TAG}.png`);
}
await mobile.close();

const desktop = await (await browser.newContext({
	viewport: { width: 1440, height: 900 }, locale: 'es-ES',
})).newPage();
await signIn(desktop);
for (const [route, name] of [['/products', 'products'], ['/plantilla-lista', 'plantilla-lista']]) {
	await desktop.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
	await desktop.waitForTimeout(900);
	const layout = await desktop.evaluate(() => {
		const tbl = document.querySelector('table.tbl');
		if (!tbl) return null;
		const thead = tbl.querySelector('thead');
		const td = tbl.querySelector('tbody td[data-label]') || tbl.querySelector('tbody td');
		const before = td ? getComputedStyle(td, '::before').content : null;
		return {
			table: getComputedStyle(tbl).display,
			thead: thead ? getComputedStyle(thead).display : null,
			td: td ? getComputedStyle(td).display : null,
			tdBefore: before,
		};
	});
	console.log(name, '1440 layout', JSON.stringify(layout));
	await desktop.screenshot({ path: `shots/651-${name}-1440-${TAG}.png` });
	console.log(`shots/651-${name}-1440-${TAG}.png`);
}
await desktop.close();
await browser.close();
