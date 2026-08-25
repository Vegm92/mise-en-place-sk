#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Horizontal-scroll affordance audit (issue #658).
 *
 * Drives the running dev server with Playwright at a phone viewport and reports,
 * for every route, each horizontally overflowing strip: its scrollWidth vs
 * clientWidth, how far past the viewport it runs, and whether it carries a
 * visible affordance (edge fade mask, visible scrollbar, or an alternative
 * entry point such as a filter sheet).
 *
 * Usage:
 *   BASE=http://127.0.0.1:5208 ROUTES="/suppliers,/invoices" OUT=mobile-audit \
 *     node scripts/scroll-strip-audit.mjs
 *
 * Run it from the repo root: besides OUT/report.json it refreshes
 * tests/fixtures/scroll-strip-audit.json, which tests/scroll-strip-affordance.test.ts
 * asserts on.
 *
 * Env:
 *   BASE      dev server origin           (default http://127.0.0.1:5208)
 *   ROUTES    comma-separated route list  (default the four strips in #658)
 *   WIDTH     viewport width in px        (default 390)
 *   OUT       output directory            (default mobile-audit)
 *   EMAIL     login email                 (default test@example.com)
 *   PASSWORD  login password              (default Test1234!)
 *   SHOTS     "1" to clip-screenshot every reported strip
 *   BATCH_ID  batch uuid used to resolve /batch/[id]
 *   NO_FIXTURE "1" to skip refreshing tests/fixtures/scroll-strip-audit.json
 *   CHROMIUM  browser executable path
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5208';
const WIDTH = Number(process.env.WIDTH ?? 390);
const OUT = process.env.OUT ?? 'mobile-audit';
const EMAIL = process.env.EMAIL ?? 'test@example.com';
const PASSWORD = process.env.PASSWORD ?? 'Test1234!';
const SHOTS = process.env.SHOTS === '1';
const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROUTES = (process.env.ROUTES ?? '/suppliers,/invoices,/suppliers/[id],/batch/[id]')
	.split(',')
	.map((r) => r.trim())
	.filter(Boolean);

const MAX_VIEWPORT_RATIO = 3;

function collect(viewportWidth) {
	const describe = (el) => {
		const id = el.id ? `#${el.id}` : '';
		const cls = typeof el.className === 'string' && el.className.trim()
			? `.${el.className.trim().split(/\s+/).join('.')}`
			: '';
		return `${el.tagName.toLowerCase()}${id}${cls}`;
	};
	const out = [];
	let seq = 0;
	for (const el of document.querySelectorAll('*')) {
		const rect = el.getBoundingClientRect();
		if (rect.width < 40 || rect.height < 4) continue;
		const cs = getComputedStyle(el);
		if (cs.visibility === 'hidden' || cs.display === 'none') continue;
		const overflowX = cs.overflowX;
		const scrollable = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';
		const clipped = overflowX === 'hidden' || overflowX === 'clip';
		if (!scrollable && !clipped) continue;
		const over = el.scrollWidth - el.clientWidth;
		if (over <= 1) continue;
		if (clipped) {
			if (cs.textOverflow === 'ellipsis') continue;
			if (el.childElementCount < 2) continue;
			if (cs.display !== 'flex' && cs.display !== 'grid' && cs.display !== 'inline-flex') continue;
		}
		const mask = cs.maskImage && cs.maskImage !== 'none'
			? cs.maskImage
			: (cs.webkitMaskImage && cs.webkitMaskImage !== 'none' ? cs.webkitMaskImage : 'none');
		const parentMask = el.parentElement
			? (() => {
				const p = getComputedStyle(el.parentElement);
				const m = p.maskImage && p.maskImage !== 'none' ? p.maskImage : p.webkitMaskImage;
				return m && m !== 'none' ? m : 'none';
			})()
			: 'none';
		const scrollbarVisible = scrollable && el.offsetHeight - el.clientHeight > 1;
		const altEntry = Boolean(el.querySelector('[data-scroll-strip-more]'))
			|| Boolean(el.closest('[data-scroll-strip-root]')?.querySelector('[data-scroll-strip-more]'));
		const isStrip = el.classList.contains('scroll-strip')
			|| Boolean(el.closest('.scroll-strip'));
		el.setAttribute('data-audit-id', 'strip-' + seq);
		out.push({
			auditId: 'strip-' + seq++,
			selector: describe(el),
			kind: scrollable ? 'scrollable' : 'clipped',
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
			overflowPx: over,
			viewportRatio: Number((el.scrollWidth / viewportWidth).toFixed(2)),
			maskImage: mask,
			parentMaskImage: parentMask,
			scrollbarVisible,
			usesSharedStrip: isStrip,
			altEntry,
			firstItem: (el.firstElementChild?.textContent ?? '').trim().slice(0, 40),
			lastItem: (el.lastElementChild?.textContent ?? '').trim().slice(0, 40),
			lastItemRight: Math.round((el.lastElementChild?.getBoundingClientRect().right ?? 0)),
		});
	}
	return out;
}

function verdict(strip) {
	const reasons = [];
	if (strip.kind === 'clipped') reasons.push('content clipped with no way to scroll to it');
	const hasFade = strip.maskImage !== 'none' || strip.parentMaskImage !== 'none';
	if (strip.kind === 'scrollable' && !hasFade && !strip.scrollbarVisible) {
		reasons.push('no edge fade and no visible scrollbar');
	}
	if (strip.viewportRatio > MAX_VIEWPORT_RATIO && !strip.altEntry) {
		reasons.push(`runs ${strip.viewportRatio}x the viewport with no alternative entry point`);
	}
	return { hasAffordance: hasFade || strip.scrollbarVisible, ok: reasons.length === 0, reasons };
}

async function login(page) {
	await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
	const result = await page.evaluate(async ([email, password]) => {
		const body = new URLSearchParams({ email, password });
		const res = await fetch('/login?/signIn', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true', 'content-type': 'application/x-www-form-urlencoded' },
			body,
		});
		return await res.json();
	}, [EMAIL, PASSWORD]);
	if (result?.type === 'redirect') {
		await page.goto(`${BASE}${result.location}`, { waitUntil: 'networkidle' });
	} else if (result?.type !== 'success') {
		throw new Error(`login failed: ${JSON.stringify(result).slice(0, 300)}`);
	}
}

async function resolveRoute(page, route) {
	if (route === '/suppliers/[id]') {
		await page.goto(`${BASE}/suppliers`, { waitUntil: 'networkidle' });
		const href = await page.evaluate(() => {
			const link = [...document.querySelectorAll('a[href^="/suppliers/"]')]
				.map((a) => a.getAttribute('href'))
				.find((h) => /^\/suppliers\/\d+$/.test(h ?? ''));
			return link ?? null;
		});
		return href;
	}
	if (route === '/batch/[id]') {
		return process.env.BATCH_ID ? `/batch/${process.env.BATCH_ID}` : null;
	}
	return route;
}

async function main() {
	fs.mkdirSync(OUT, { recursive: true });
	const browser = await chromium.launch({ executablePath: CHROMIUM });
	const context = await browser.newContext({
		viewport: { width: WIDTH, height: 844 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
	});
	const page = await context.newPage();
	await login(page);

	const routes = [];
	for (const requested of ROUTES) {
		const route = await resolveRoute(page, requested);
		if (!route) {
			console.log(`\n${requested}\n  skipped: could not resolve an id (set BATCH_ID=... for /batch/[id])`);
			continue;
		}
		await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(600);
		const found = await page.evaluate(collect, WIDTH);
		const strips = found.map((s) => ({ ...s, ...verdict(s) }));
		if (SHOTS) {
			for (const strip of strips) {
				const handle = page.locator(`[data-audit-id="${strip.auditId}"]`);
				const file = path.join(OUT, `${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}-${strip.auditId}.png`);
				await handle.screenshot({ path: file }).catch(() => {});
				strip.screenshot = file;
			}
			const full = path.join(OUT, `${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}-page.png`);
			await page.screenshot({ path: full });
		}
		routes.push({ route, strips });
	}

	await browser.close();

	const report = {
		generatedAt: new Date().toISOString(),
		viewportWidth: WIDTH,
		maxViewportRatio: MAX_VIEWPORT_RATIO,
		routes,
	};
	const reportPath = path.join(OUT, 'report.json');
	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

	if (process.env.NO_FIXTURE !== '1') {
		const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'scroll-strip-audit.json');
		fs.mkdirSync(path.dirname(fixture), { recursive: true });
		fs.writeFileSync(fixture, `${JSON.stringify(report, null, 2)}\n`);
	}

	let failures = 0;
	for (const { route, strips } of routes) {
		console.log(`\n${route}`);
		if (strips.length === 0) {
			console.log('  no horizontally overflowing strips');
			continue;
		}
		for (const s of strips) {
			const mark = s.ok ? 'PASS' : 'FAIL';
			if (!s.ok) failures++;
			console.log(
				`  [${mark}] ${s.selector}\n` +
				`         scrollWidth ${s.scrollWidth}px vs clientWidth ${s.clientWidth}px ` +
				`(${s.viewportRatio}x viewport, ${s.overflowPx}px off-screen, kind=${s.kind})\n` +
				`         affordance=${s.hasAffordance} sharedStrip=${s.usesSharedStrip} altEntry=${s.altEntry} ` +
				`lastItem="${s.lastItem}" right=${s.lastItemRight}` +
				(s.reasons.length ? `\n         ${s.reasons.join('; ')}` : ''),
			);
		}
	}
	console.log(`\nreport: ${reportPath}`);
	console.log(failures === 0 ? 'all strips indicate more content' : `${failures} strip(s) without an affordance`);
	process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
	console.error(err);
	process.exit(2);
});
