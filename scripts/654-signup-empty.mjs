import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5254';
const EMAIL = process.env.NEW_EMAIL || '654-empty@example.com';
const PASSWORD = 'Test1234!';
const LOG = process.env.DEV_LOG;
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: CHROME });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' })).newPage();

await page.goto(BASE + '/signup', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
const confirm = page.locator('input[name="confirm"], input[name="password_confirm"], input[name="confirmPassword"]');
if (await confirm.count()) await confirm.first().fill(PASSWORD);
const terms = page.locator('input[name="terms"], input#terms');
if (await terms.count()) await terms.first().check();
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
console.log('after signup:', page.url());

const log = fs.readFileSync(LOG, 'utf8');
const matches = [...log.matchAll(/verify-email\?email=[^\s"']+/g)].filter(m => decodeURIComponent(m[0]).includes(EMAIL));
if (!matches.length) { console.log('NO VERIFY URL FOUND'); console.log(log.split('\n').filter(l => l.includes('email')).slice(-10).join('\n')); process.exit(1); }
const verifyPath = '/' + matches[matches.length - 1][0];
console.log('verify url:', verifyPath);
await page.goto(BASE + verifyPath, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('after verify:', page.url());

if (!page.url().includes('/onboarding') && !page.url().includes('/analytics')) {
	await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
	if (await page.locator('input[name="email"]').count()) {
		await page.fill('input[name="email"]', EMAIL);
		await page.fill('input[name="password"]', PASSWORD);
		await page.click('button[type="submit"]');
		await page.waitForTimeout(2500);
	}
	console.log('after login:', page.url());
}

if (page.url().includes('/onboarding')) {
	for (let step = 0; step < 8; step++) {
		const nameInput = page.locator('input[name="name"], input[name="restaurant_name"], input[name="restaurantName"]');
		if (await nameInput.count()) { await nameInput.first().fill('Empty Test 654'); }
		const btn = page.locator('button[type="submit"], a:has-text("Saltar"), button:has-text("Saltar"), button:has-text("Continuar"), button:has-text("Empezar")');
		if (!(await btn.count())) break;
		await btn.first().click();
		await page.waitForTimeout(2000);
		console.log('onboarding step', step, '->', page.url());
		if (!page.url().includes('/onboarding')) break;
	}
}
console.log('final:', page.url());
await page.screenshot({ path: 'shots/654-signup-final.png' });
await browser.close();
