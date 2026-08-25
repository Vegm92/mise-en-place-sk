import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5252';
const ID = process.env.INVOICE_ID || '2';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

fs.mkdirSync('shots', { recursive: true });

async function signIn(page) {
	await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
	await page.fill('input[name="email"]', 'test@example.com');
	await page.fill('input[name="password"]', 'Test1234!');
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
await mobile.goto(`${BASE}/invoice/${ID}/edit`, { waitUntil: 'networkidle' });
await mobile.waitForTimeout(600);

const dump = await mobile.evaluate(() => {
	const out = [];
	for (const el of document.querySelectorAll('main input:not([type=hidden]), main textarea, main button')) {
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) continue;
		const cs = getComputedStyle(el);
		out.push({
			tag: el.tagName.toLowerCase(),
			name: el.getAttribute('name') || (el.textContent || '').trim().slice(0, 16),
			fontSize: parseFloat(cs.fontSize),
			height: Math.round(r.height),
			right: Math.round(r.right),
			left: Math.round(r.left),
		});
	}
	return out;
});
const inputs = dump.filter(d => d.tag !== 'button');
console.log('INPUT DUMP (mobile 390x844):');
for (const d of dump) console.log(`  ${d.tag} ${d.name || '-'} font=${d.fontSize}px h=${d.height}px x=[${d.left},${d.right}]`);
console.log('SUMMARY: inputs minFont=' + Math.min(...inputs.map(d => d.fontSize))
	+ ' minHeight=' + Math.min(...inputs.map(d => d.height))
	+ ' maxRight=' + Math.max(...dump.map(d => d.right))
	+ ' viewport=390');

await mobile.screenshot({ path: 'shots/652-mobile-cards.png', fullPage: true });

const rowsBefore = await mobile.locator('input[name="line_descriptions"]').count();
await mobile.locator('input[name="line_descriptions"]').first().fill('Lubina salvaje corregida');
await mobile.locator('input[name="line_quantities"]').first().fill('3');
await mobile.waitForTimeout(300);
const price = await mobile.locator('input[name="line_unit_prices"]').first().inputValue();
const total = await mobile.locator('.li-a-total').first().inputValue();
console.log(`INTERACT: rows=${rowsBefore} qty set to 3, unit_price=${price}, computed line total=${total} (expected ${(3 * parseFloat(price)).toFixed(2)})`);

await mobile.locator('.li-a-del').last().click();
await mobile.waitForTimeout(300);
const rowsAfterDelete = await mobile.locator('input[name="line_descriptions"]').count();
console.log(`INTERACT: after delete rows=${rowsAfterDelete} (expected ${rowsBefore - 1})`);
await mobile.screenshot({ path: 'shots/652-mobile-after-delete.png', fullPage: true });

await mobile.getByRole('button', { name: /línea|line/i }).click();
await mobile.waitForTimeout(300);
const rowsAfterAdd = await mobile.locator('input[name="line_descriptions"]').count();
console.log(`INTERACT: after add rows=${rowsAfterAdd} (expected ${rowsBefore})`);

const desktop = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' })).newPage();
await signIn(desktop);
await desktop.goto(`${BASE}/invoice/${ID}/edit`, { waitUntil: 'networkidle' });
await desktop.waitForTimeout(600);
const desktopCols = await desktop.evaluate(() =>
	getComputedStyle(document.querySelector('.li-row')).gridTemplateColumns
);
console.log('DESKTOP 1440 row grid-template-columns: ' + desktopCols);
await desktop.screenshot({ path: 'shots/652-desktop-grid.png', fullPage: true });

await browser.close();
console.log('DONE (no save submitted; seeded data untouched)');
