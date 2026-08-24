#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Issue #660 — the shell header page title must not truncate on a 390px phone.
 *
 * Logs into a running dev server, visits every `(app)` route at 390×844, and
 * compares the header `h1`'s scrollWidth against its clientWidth. A title whose
 * content is wider than its box is being cut off by the ellipsis.
 *
 * Usage:
 *   node scripts/check-header-title-fit.mjs
 *   TEST_BASE_URL=http://127.0.0.1:5210 node scripts/check-header-title-fit.mjs
 *   node scripts/check-header-title-fit.mjs --shots shots
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5210';
const EMAIL = process.env.TEST_EMAIL ?? 'test@example.com';
const PASS = process.env.TEST_PASSWORD ?? 'Test1234!';
const EXECUTABLE =
	process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > -1 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const ROUTES = [
	'/',
	'/dashboard',
	'/invoices',
	'/invoices/export',
	'/suppliers',
	'/suppliers/1',
	'/products',
	'/products/1',
	'/analytics/spend',
	'/analytics/prices',
	'/analytics/extraction',
	'/budgets',
	'/reminders',
	'/reports',
	'/chat',
	'/settings',
	'/billing',
	'/plantilla-lista',
	'/invoice/1',
	'/invoice/1/edit',
];

const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
const redirect = await page.evaluate(
	async ([base, email, pass]) => {
		const res = await fetch(`${base}/login?/signIn`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body: new URLSearchParams({ email, password: pass }),
		});
		return await res.json();
	},
	[BASE, EMAIL, PASS],
);
if (redirect?.type !== 'redirect') {
	console.error('login failed:', JSON.stringify(redirect).slice(0, 400));
	await browser.close();
	process.exit(1);
}
await page.goto(`${BASE}${redirect.location}`, { waitUntil: 'domcontentloaded' });
console.log(`logged in as ${EMAIL}\n`);

const rows = [];
for (const route of ROUTES) {
	await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('header h1', { timeout: 15_000 });
	await page.waitForTimeout(400);
	const m = await page.$eval('header h1', (el) => ({
		text: el.textContent.trim(),
		scrollWidth: el.scrollWidth,
		clientWidth: el.clientWidth,
		fontSize: getComputedStyle(el).fontSize,
	}));
	const truncated = m.scrollWidth > m.clientWidth;
	const fallback = m.text === 'Mise en Place' && route !== '/mise-en-place';
	rows.push({ route, ...m, truncated, fallback });
	if (SHOTS) {
		const name = route === '/' ? 'root' : route.replace(/^\//, '').replaceAll('/', '_');
		await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
	}
}
await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(
	`${pad('route', 24)}${pad('title', 26)}${pad('font', 7)}${pad('scroll', 8)}${pad('client', 8)}status`,
);
let bad = 0;
for (const r of rows) {
	const problems = [];
	if (r.truncated) problems.push('TRUNCATED');
	if (r.fallback) problems.push('FALLBACK TITLE');
	if (problems.length) bad++;
	console.log(
		pad(r.route, 24) +
			pad(r.text, 26) +
			pad(r.fontSize, 7) +
			pad(r.scrollWidth, 8) +
			pad(r.clientWidth, 8) +
			(problems.length ? `✗ ${problems.join(' + ')}` : '✓'),
	);
}

console.log(`\n${rows.length - bad}/${rows.length} routes fit at 390px.`);
if (SHOTS) console.log(`screenshots: ${path.resolve(SHOTS)}`);
process.exit(bad > 0 ? 1 : 0);
