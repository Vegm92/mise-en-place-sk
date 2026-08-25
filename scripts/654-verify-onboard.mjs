import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5254';
const EMAIL = process.env.NEW_EMAIL || '654-empty@example.com';
const PASSWORD = 'Test1234!';
const TOKEN = process.env.TOKEN;
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: CHROME });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' })).newPage();

if (TOKEN) {
	await page.goto(`${BASE}/verify-email?email=${encodeURIComponent(EMAIL)}&token=${TOKEN}`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	const confirmBtn = page.locator('button[type="submit"], button:has-text("Confirmar")');
	if (await confirmBtn.count()) {
		await confirmBtn.first().click();
		await page.waitForTimeout(2000);
	}
	console.log('after verify:', page.url());
	console.log('verify page text:', (await page.textContent('body'))?.replace(/\s+/g, ' ').slice(0, 300));
}

if (!page.url().includes('/onboarding')) {
	await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
	if (await page.locator('input[name="email"]').count()) {
		await page.fill('input[name="email"]', EMAIL);
		await page.fill('input[name="password"]', PASSWORD);
		await page.click('button[type="submit"]');
		await page.waitForTimeout(2500);
	}
	console.log('after login:', page.url());
}

for (let step = 0; step < 10; step++) {
	if (!page.url().includes('/onboarding') && !page.url().includes('/pending')) break;
	console.log('onboarding page text:', (await page.textContent('body'))?.replace(/\s+/g, ' ').slice(0, 200));
	const nameInput = page.locator('input[name="name"], input[name="restaurant_name"], input[name="restaurantName"]');
	if (await nameInput.count()) await nameInput.first().fill('Empty Test 654');
	const btn = page.locator('button[type="submit"], button:has-text("Continuar"), button:has-text("Empezar"), a:has-text("Saltar"), button:has-text("Saltar")');
	if (!(await btn.count())) break;
	await btn.first().click();
	await page.waitForTimeout(2200);
	console.log('onboarding step', step, '->', page.url());
}
console.log('final:', page.url());
for (const route of ['/analytics/spend', '/analytics/prices', '/analytics/extraction']) {
	const resp = await page.goto(BASE + route, { waitUntil: 'networkidle' });
	console.log(route, resp?.status(), '->', page.url());
}
await browser.close();
