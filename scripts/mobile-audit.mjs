import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || 'mobile-audit';
const EMAIL = process.env.AUDIT_EMAIL || 'test@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD || 'Test1234!';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PUBLIC_ONLY = process.env.PUBLIC_ONLY === '1';

const DEFAULT_ROUTES = [
	'/dashboard', '/invoices', '/suppliers', '/products', '/budgets', '/reminders',
	'/analytics/spend', '/analytics/prices', '/analytics/extraction',
	'/reports', '/chat', '/billing', '/settings', '/invoices/export', '/',
];
const ROUTES = (process.env.ROUTES || DEFAULT_ROUTES.join(',')).split(',').map(r => r.trim()).filter(Boolean);

const MOBILE = {
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 1,
	isMobile: true,
	hasTouch: true,
	locale: 'es-ES',
	userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'es-ES' };

const UNLOCK_CSS =
	'.mep{height:auto!important;overflow:visible!important}' +
	'.mep>div{overflow:visible!important}' +
	'main{overflow:visible!important;height:auto!important}';

function measure() {
	const vw = window.innerWidth;
	const inSidebar = (el) => !!el.closest('aside');
	const root = document.querySelector('main') || document.body;
	const clipped = [];
	const scrollers = [];
	const smallTargets = [];
	const tinyFonts = new Set();

	for (const el of root.querySelectorAll('*')) {
		if (inSidebar(el)) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) continue;
		const cs = getComputedStyle(el);
		if (cs.position === 'fixed') continue;
		const label = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
		if (rect.right > vw + 1) {
			clipped.push({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 60), width: Math.round(rect.width), right: Math.round(rect.right), text: label });
		}
		if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
			scrollers.push({ tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 60), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: cs.overflowX, text: label });
		}
		const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
		if (ownText && parseFloat(cs.fontSize) < 12) tinyFonts.add(cs.fontSize + ' | ' + label);
	}

	for (const el of root.querySelectorAll('a, button, input, select, [role="button"]')) {
		if (inSidebar(el)) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) continue;
		if (rect.height < 40) {
			smallTargets.push({ tag: el.tagName.toLowerCase(), height: Math.round(rect.height), width: Math.round(rect.width), text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28) });
		}
	}

	return {
		viewportWidth: vw,
		clippedCount: clipped.length,
		clipped: clipped.slice(0, 12),
		scrollerCount: scrollers.length,
		scrollers: scrollers.slice(0, 8),
		smallTargetCount: smallTargets.length,
		smallTargets: smallTargets.slice(0, 8),
		tinyFonts: [...tinyFonts].slice(0, 8),
	};
}

function readVisibleText() {
	const root = document.querySelector('main') || document.body;
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
	walk(root);
	return acc.join(' ');
}

async function signIn(page) {
	await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await Promise.all([
		page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
		page.click('button[type="submit"]'),
	]);
	await page.waitForTimeout(1000);
}

const tokenize = (text) => new Set(
	text.replace(/\s+/g, ' ').trim().split(/\s+/).map(t => t.trim()).filter(t => t.length > 2)
);

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const mobile = await (await browser.newContext(MOBILE)).newPage();
const desktop = PUBLIC_ONLY ? null : await (await browser.newContext(DESKTOP)).newPage();
if (!PUBLIC_ONLY) {
	await signIn(mobile);
	await signIn(desktop);
}

const report = [];
for (const route of ROUTES) {
	const name = route === '/' ? 'root' : route.replace(/^\//, '').replace(/\//g, '_');
	try {
		const response = await mobile.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
		await mobile.waitForTimeout(900);
		const metrics = await mobile.evaluate(measure);
		const mobileText = await mobile.evaluate(readVisibleText);

		let desktopOnly = [];
		if (desktop) {
			await desktop.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
			await desktop.waitForTimeout(900);
			const desktopText = await desktop.evaluate(readVisibleText);
			const seen = tokenize(mobileText);
			desktopOnly = [...tokenize(desktopText)].filter(t => !seen.has(t));
		}

		await mobile.addStyleTag({ content: UNLOCK_CSS });
		await mobile.waitForTimeout(400);
		await mobile.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });

		report.push({ route, status: response?.status(), ...metrics, desktopOnlyCount: desktopOnly.length, desktopOnly: desktopOnly.slice(0, 40) });
		console.log(`${route} | clipped=${metrics.clippedCount} scrollers=${metrics.scrollerCount} smallTargets=${metrics.smallTargetCount} tinyFonts=${metrics.tinyFonts.length} desktopOnly=${desktopOnly.length}`);
	} catch (error) {
		report.push({ route, error: String(error).slice(0, 200) });
		console.log(`${route} | ERROR ${String(error).slice(0, 120)}`);
	}
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nWrote ${report.length} entries to ${path.join(OUT, 'report.json')}`);
await browser.close();
