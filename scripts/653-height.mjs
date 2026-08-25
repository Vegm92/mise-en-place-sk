import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5253';
const EMAIL = process.env.AUDIT_EMAIL || 'test@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD || 'Test1234!';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 1,
	isMobile: true,
	hasTouch: true,
	locale: 'es-ES',
});
const page = await ctx.newPage();
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
	page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
	page.click('button[type="submit"]'),
]);
await page.waitForTimeout(1000);
await page.goto(BASE + '/budgets', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

console.log('url:', page.url());
const stats = await page.evaluate(() => {
	const mobileRoot = [...document.querySelectorAll('div')].find(
		(d) => (d.getAttribute('class') || '').includes('md:hidden')
	);
	const scroller = mobileRoot?.querySelector('form > div');
	const cards = [...(mobileRoot?.querySelectorAll('.card') ?? [])];
	const budgetInputs = [...(mobileRoot?.querySelectorAll('input[type="number"]') ?? [])];
	const inputMetrics = budgetInputs.slice(0, 3).map((el) => {
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		return { height: Math.round(r.height), fontSize: cs.fontSize };
	});
	return {
		bodyScrollHeight: document.body.scrollHeight,
		innerScrollHeight: scroller ? scroller.scrollHeight : null,
		cardCount: cards.length,
		budgetInputCount: budgetInputs.length,
		inputMetrics,
	};
});
console.log(JSON.stringify(stats, null, 2));
await browser.close();
