#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Mobile accessibility audit (issue #659).
 *
 * Drives the running app with Playwright at a phone viewport and measures, per
 * route, three things the MEP component classes historically got wrong:
 *
 *   smallTargets  — visible interactive elements whose smaller edge is under
 *                   44 CSS px (WCAG 2.5.5 / Apple HIG minimum tap target).
 *   tinyText      — visible text rendered under 11 px (the bottom of the MEP
 *                   type scale).
 *   smallInputs   — form fields with a font-size under 16 px, which makes iOS
 *                   Safari zoom the viewport on focus and never zoom back.
 *
 * Exclusions are deliberate and narrow, see SKIP_* below.
 *
 * Usage:
 *   node scripts/seed-demo-data.mjs                 # once, local DB only
 *   npx vite dev --port 5209 --host 127.0.0.1 &
 *   node scripts/mobile-audit.mjs                   # writes tests/fixtures/mobile-audit.json
 *
 * Flags:
 *   --base-url=<url>   default http://127.0.0.1:5209
 *   --width=<px>       default 390 (>= 768 drops the phone emulation)
 *   --height=<px>      default 844
 *   --out=<path>       default tests/fixtures/mobile-audit.json ('-' for stdout only)
 *   --shots=<dir>      also write a full-page screenshot per route
 *   --quiet            suppress the per-route console table
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TARGET_MIN_PX = 44;
export const TEXT_MIN_PX = 11;
export const INPUT_MIN_PX = 16;

export const ROUTES = [
	'/dashboard',
	'/invoices',
	'/invoices/export',
	'/suppliers',
	'/products',
	'/budgets',
	'/reminders',
	'/settings',
	'/chat',
	'/analytics/spend',
];

const DEFAULTS = {
	baseUrl: 'http://127.0.0.1:5209',
	width: 390,
	height: 844,
	out: 'tests/fixtures/mobile-audit.json',
	email: 'test@example.com',
	password: 'Test1234!',
};

function arg(name, fallback) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
}

function chromiumPath() {
	const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
	if (explicit) return explicit;
	const base = '/opt/pw-browsers';
	if (!fs.existsSync(base)) return undefined;
	const dir = fs
		.readdirSync(base)
		.filter((d) => /^chromium-\d+$/.test(d))
		.sort()
		.pop();
	return dir ? path.join(base, dir, 'chrome-linux', 'chrome') : undefined;
}

/**
 * Runs inside the page. Kept as a single string-serialised function so the
 * whole measurement lives in one place.
 */
function collect(limits) {
	// `label` is in the query only so it can be excluded explicitly below; its
	// size is measured as part of the control it names, never on its own.
	const INTERACTIVE = [
		'a[href]',
		'button',
		'input:not([type="hidden"])',
		'select',
		'textarea',
		'summary',
		'label[for]',
		'[role="button"]',
		'[role="link"]',
		'[role="tab"]',
		'[role="switch"]',
		'[role="checkbox"]',
		'[role="radio"]',
		'[role="menuitem"]',
		'[tabindex]:not([tabindex="-1"])',
	].join(',');

	// The sidebar is off-canvas at phone widths behind a hamburger and the issue
	// measures the page without it; it is reported separately as `sidebar`.
	const inSidebar = (el) => !!el.closest('aside');

	const visible = (el) => {
		if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.height > 0;
	};

	const tag = (el) => {
		const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter((c) => !c.startsWith('s-')).slice(0, 3).join('.') : '';
		return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
	};

	const describe = (el) => {
		const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
		const href = el.getAttribute && el.getAttribute('href');
		const chain = [];
		for (let p = el.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) chain.unshift(tag(p));
		return `${chain.join('>')}>${tag(el)}${href ? `[${href}]` : ''}${text ? ` "${text}"` : ''}`;
	};

	// A tap anywhere on a control's label activates the control, so the real
	// target is the union of the two. Labels are therefore never reported on
	// their own — they are folded into the control they name.
	const labelsFor = (el) => {
		const found = [];
		const wrapper = el.closest('label');
		if (wrapper) found.push(wrapper);
		if (el.id) {
			for (const l of document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)) found.push(l);
		}
		if (el.labels) for (const l of el.labels) if (!found.includes(l)) found.push(l);
		return found;
	};

	const targetRect = (el) => {
		let r = el.getBoundingClientRect();
		let { top, left, right, bottom } = r;
		if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
			for (const l of labelsFor(el)) {
				if (!visible(l)) continue;
				const lr = l.getBoundingClientRect();
				top = Math.min(top, lr.top);
				left = Math.min(left, lr.left);
				right = Math.max(right, lr.right);
				bottom = Math.max(bottom, lr.bottom);
			}
		}
		return { width: right - left, height: bottom - top };
	};

	// WCAG 2.5.8 exempts targets that sit inline inside a sentence: their size is
	// determined by the line box, not by the control. Only a link whose computed
	// display is `inline` and whose parent carries other prose qualifies.
	const inlineInProse = (el) => {
		if (el.tagName !== 'A') return false;
		if (getComputedStyle(el).display !== 'inline') return false;
		const parent = el.parentElement;
		if (!parent) return false;
		const own = (el.textContent || '').trim();
		const around = (parent.textContent || '').trim();
		return around.length > own.length + 3;
	};

	const smallTargets = [];
	const sidebarTargets = [];
	const seen = new Set();
	for (const el of document.querySelectorAll(INTERACTIVE)) {
		if (seen.has(el)) continue;
		seen.add(el);
		if (el.tagName === 'LABEL') continue;
		if (!visible(el)) continue;
		const r = targetRect(el);
		const min = Math.min(r.width, r.height);
		if (min >= limits.target) continue;
		const entry = {
			selector: describe(el),
			width: Math.round(r.width * 10) / 10,
			height: Math.round(r.height * 10) / 10,
		};
		if (inSidebar(el)) sidebarTargets.push(entry);
		else if (!inlineInProse(el)) smallTargets.push(entry);
	}

	const tinyText = [];
	const tinySeen = new Map();
	for (const el of document.querySelectorAll('*')) {
		if (inSidebar(el)) continue;
		let own = '';
		for (const node of el.childNodes) {
			if (node.nodeType === 3) own += node.nodeValue;
		}
		if (!own.trim()) continue;
		if (!visible(el)) continue;
		const size = parseFloat(getComputedStyle(el).fontSize);
		if (!(size < limits.text)) continue;
		const key = `${describe(el)}|${size}`;
		if (tinySeen.has(key)) {
			tinySeen.get(key).count++;
			continue;
		}
		const entry = { selector: describe(el), fontSize: size, count: 1 };
		tinySeen.set(key, entry);
		tinyText.push(entry);
	}

	const smallInputs = [];
	for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
		if (inSidebar(el)) continue;
		if (!visible(el)) continue;
		const cs = getComputedStyle(el);
		const size = parseFloat(cs.fontSize);
		if (size >= limits.input) continue;
		smallInputs.push({ selector: describe(el), fontSize: size, type: el.getAttribute('type') || el.tagName.toLowerCase() });
	}

	return { smallTargets, sidebarTargets, tinyText, smallInputs };
}

async function login(page, baseUrl, email, password) {
	await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
	const result = await page.evaluate(async ({ email, password }) => {
		const res = await fetch('/login?/signIn', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true', 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ email, password }).toString(),
		});
		return res.json();
	}, { email, password });
	if (result?.type !== 'redirect') throw new Error(`login failed: ${JSON.stringify(result)}`);
	await page.goto(`${baseUrl}${result.location}`, { waitUntil: 'domcontentloaded' });
}

export async function audit(options = {}) {
	const cfg = { ...DEFAULTS, ...options };
	const width = Number(cfg.width);
	const height = Number(cfg.height);
	const phone = width < 768;
	const browser = await chromium.launch({ executablePath: chromiumPath() });
	const context = await browser.newContext({
		viewport: { width, height },
		deviceScaleFactor: phone ? 2 : 1,
		isMobile: phone,
		hasTouch: phone,
	});
	const page = await context.newPage();
	const routes = [];
	try {
		await login(page, cfg.baseUrl, cfg.email, cfg.password);
		for (const route of ROUTES) {
			const response = await page.goto(`${cfg.baseUrl}${route}`, { waitUntil: 'networkidle' });
			await page.waitForTimeout(400);
			const found = await page.evaluate(collect, {
				target: TARGET_MIN_PX,
				text: TEXT_MIN_PX,
				input: INPUT_MIN_PX,
			});
			routes.push({
				route,
				status: response?.status() ?? 0,
				url: new URL(page.url()).pathname,
				...found,
			});
			if (cfg.shots) {
				fs.mkdirSync(cfg.shots, { recursive: true });
				await page.screenshot({
					path: path.join(cfg.shots, `${route.replace(/^\//, '').replace(/\//g, '-')}-${cfg.width}.png`),
					fullPage: true,
				});
			}
		}
	} finally {
		await browser.close();
	}

	return {
		generatedAt: new Date().toISOString(),
		viewport: { width, height },
		limits: { target: TARGET_MIN_PX, text: TEXT_MIN_PX, input: INPUT_MIN_PX },
		routes,
		totals: {
			smallTargets: routes.reduce((n, r) => n + r.smallTargets.length, 0),
			tinyText: routes.reduce((n, r) => n + r.tinyText.length, 0),
			smallInputs: routes.reduce((n, r) => n + r.smallInputs.length, 0),
		},
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const report = await audit({
		baseUrl: arg('base-url', DEFAULTS.baseUrl),
		width: arg('width', DEFAULTS.width),
		height: arg('height', DEFAULTS.height),
		out: arg('out', DEFAULTS.out),
		shots: arg('shots', undefined),
	});
	const out = arg('out', DEFAULTS.out);
	if (out !== '-') {
		const target = path.isAbsolute(out) ? out : path.join(ROOT, out);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, JSON.stringify(report, null, '\t') + '\n');
	}
	if (!process.argv.includes('--quiet')) {
		const pad = (s, n) => String(s).padEnd(n);
		console.log(`${pad('route', 22)}${pad('targets<44', 12)}${pad('text<11', 10)}${pad('inputs<16', 10)}`);
		for (const r of report.routes) {
			console.log(`${pad(r.route, 22)}${pad(r.smallTargets.length, 12)}${pad(r.tinyText.length, 10)}${pad(r.smallInputs.length, 10)}`);
		}
		console.log(`${pad('TOTAL', 22)}${pad(report.totals.smallTargets, 12)}${pad(report.totals.tinyText, 10)}${pad(report.totals.smallInputs, 10)}`);
	}
	const failed = report.totals.smallTargets + report.totals.tinyText + report.totals.smallInputs;
	process.exit(failed === 0 ? 0 : 1);
}
