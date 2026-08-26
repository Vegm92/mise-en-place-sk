#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import 'dotenv/config';

const BASE = process.env.QA_BASE_URL ?? 'http://localhost:5173';
const EMAIL = process.env.QA_EMAIL ?? process.env.AUTH_ADMIN_EMAIL;
const PASSWORD = process.env.QA_PASSWORD ?? process.env.AUTH_ADMIN_PASSWORD;
const OUT = process.env.QA_OUT ?? 'qa-report.md';

const APP_ROUTES = [
	'/', '/dashboard', '/invoices', '/invoices/export', '/suppliers', '/products',
	'/budgets', '/chat', '/reminders', '/settings', '/billing', '/digest',
	'/analytics/spend', '/analytics/prices', '/analytics/extraction',
];
const ADMIN_ROUTES = [
	'/admin', '/admin/access', '/admin/dead-letters', '/admin/errors',
	'/admin/events', '/admin/health', '/admin/revenue',
];
const PUBLIC_ROUTES = ['/waitlist', '/login', '/signup', '/privacy', '/terms', '/forgot-password'];
const GATED_PROBES = ['/dashboard', '/invoices', '/settings', '/billing', '/admin'];
const VIEWPORTS = [[390, 844], [768, 1024], [1280, 720]];

const path = (u) => u.replace(/^https?:\/\/[^/]+/, '');

function auditPage() {
	const q = (s) => [...document.querySelectorAll(s)];
	const visible = (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';
	const de = document.documentElement;
	const named = (e) => e.innerText.trim() || e.getAttribute('aria-label') || e.getAttribute('title');
	const labelled = (e) =>
		(e.labels && e.labels.length) || e.getAttribute('aria-label') ||
		e.getAttribute('aria-labelledby') || e.placeholder;

	const bodyText = document.body.innerText;
	const rawKeys = [...new Set([
		...[...bodyText.matchAll(/\b[a-z][a-z0-9]*(?:\.[a-z][a-zA-Z0-9]*){1,3}\b/g)].map((m) => m[0]),
		...[...bodyText.matchAll(/\b[A-Z][A-Z0-9]*(?:\.[A-Z][A-Z0-9]*){1,3}\b/g)].map((m) => m[0]),
	])].filter((k) => !/\.(com|es|io|app|pdf|png|jpg|jpeg|xlsx|net|org)$/i.test(k))
		.filter((k) => k.split('.').some((seg) => seg.length > 2));

	return {
		title: document.title,
		lang: de.lang,
		h1: q('h1').length,
		headings: q('h1,h2,h3').length,
		overflowPx: de.scrollWidth - de.clientWidth,
		unlabelledInputs: q('input,select,textarea').filter((e) => visible(e) && !labelled(e))
			.map((e) => e.name || e.type).slice(0, 40),
		unnamedButtons: q('button').filter((e) => visible(e) && !named(e)).length,
		smallTapTargets: q('button,a').filter((e) => {
			const r = e.getBoundingClientRect();
			return r.height > 0 && r.height < 32 && r.width < 32;
		}).length,
		blockingOverlays: q('div[role=presentation]').filter((e) => {
			const s = getComputedStyle(e);
			const r = e.getBoundingClientRect();
			return s.pointerEvents !== 'none' && r.width >= de.clientWidth * 0.9 &&
				r.height >= de.clientHeight * 0.9;
		}).map((e) => `z=${getComputedStyle(e).zIndex} text=${e.innerText.slice(0, 40) || '(empty)'}`),
		presentationModals: q('div[role=presentation]').filter((e) => e.innerText.trim().length > 20).length,
		dialogRoles: q('[role=dialog],dialog').length,
		tablesMissingScope: q('table').filter((t) => t.querySelector('th') && !t.querySelector('th[scope]')).length,
		rawKeyCandidates: rawKeys.slice(0, 12),
	};
}

async function visit(page, url) {
	const consoleErrors = [];
	const pageErrors = [];
	const failedRequests = [];
	const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); };
	const onPageError = (e) => pageErrors.push(String(e).slice(0, 200));
	const onResponse = (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${path(r.url())}`); };
	page.on('console', onConsole);
	page.on('pageerror', onPageError);
	page.on('response', onResponse);

	let status = 'ERR';
	let audit = {};
	try {
		const resp = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 30000 });
		status = resp ? resp.status() : 'null';
		await page.waitForTimeout(250);
		audit = await page.evaluate(auditPage);
	} catch (e) {
		status = 'NAV-ERR ' + String(e).slice(0, 90);
	}

	page.off('console', onConsole);
	page.off('pageerror', onPageError);
	page.off('response', onResponse);
	return { url, status, landedOn: path(page.url()), consoleErrors, pageErrors, failedRequests, ...audit };
}

async function login(page) {
	await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
	await page.locator('input[name=email]').fill(EMAIL);
	await page.locator('input[type=password]').fill(PASSWORD);
	await Promise.all([
		page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
		page.locator('button.btn-primary').first().click(),
	]);
	return !/\/login/.test(page.url());
}

function flagsFor(r) {
	const f = [];
	if (typeof r.status === 'number' && r.status >= 400) f.push(`HTTP ${r.status}`);
	if (String(r.status).startsWith('NAV-ERR')) f.push(r.status);
	if (r.consoleErrors?.length) f.push(`${r.consoleErrors.length} console error(s)`);
	if (r.pageErrors?.length) f.push(`${r.pageErrors.length} page error(s)`);
	if (r.failedRequests?.length) f.push(`failed: ${r.failedRequests.join(', ')}`);
	if (!r.title) f.push('empty <title>');
	if (r.overflowPx > 0) f.push(`h-overflow ${r.overflowPx}px`);
	if (r.unlabelledInputs?.length) f.push(`${r.unlabelledInputs.length} unlabelled input(s)`);
	if (r.unnamedButtons) f.push(`${r.unnamedButtons} unnamed button(s)`);
	if (r.blockingOverlays?.length) f.push(`blocking overlay: ${r.blockingOverlays.join(' | ')}`);
	if (r.presentationModals && !r.dialogRoles) f.push('modal uses role=presentation, not role=dialog');
	if (r.tablesMissingScope) f.push(`${r.tablesMissingScope} table(s) without th[scope]`);
	if (r.rawKeyCandidates?.length) f.push(`raw key candidates: ${r.rawKeyCandidates.join(', ')}`);
	if (r.h1 !== 1) f.push(`${r.h1} <h1>`);
	return f;
}

function table(rows) {
	const lines = ['| Route | Status | Findings |', '| --- | --- | --- |'];
	for (const r of rows) {
		const f = flagsFor(r);
		lines.push(`| \`${r.url}\` | ${r.status}${r.landedOn !== r.url ? ` → \`${r.landedOn}\`` : ''} | ${f.length ? f.join('; ') : 'clean'} |`);
	}
	return lines.join('\n');
}

const run = async () => {
	if (!EMAIL || !PASSWORD) throw new Error('Set QA_EMAIL/QA_PASSWORD (or AUTH_ADMIN_EMAIL/AUTH_ADMIN_PASSWORD)');
	const browser = await chromium.launch();
	const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	const page = await context.newPage();
	const report = [`# Browser QA sweep\n`, `Target: ${BASE}  •  ${new Date().toISOString()}\n`];

	const gating = [];
	for (const r of GATED_PROBES) {
		const res = await page.goto(BASE + r, { waitUntil: 'domcontentloaded' });
		gating.push(`- \`${r}\` → ${res.status()} at \`${path(page.url())}\` ${/\/login|\/waitlist/.test(page.url()) ? '(gated)' : '**NOT GATED**'}`);
	}
	report.push('## Unauthenticated gating\n', gating.join('\n'), '');

	const pub = [];
	for (const r of PUBLIC_ROUTES) pub.push(await visit(page, r));
	report.push('## Public routes\n', table(pub), '');

	const headResp = await page.goto(`${BASE}/login?cb=${Date.now()}`, { waitUntil: 'domcontentloaded' });
	const h = headResp.headers();
	const wanted = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'];
	report.push('## Security headers\n', wanted.map((k) => `- ${k}: ${h[k] ? '✅' : '❌ MISSING'}`).join('\n'), '');

	if (!(await login(page))) {
		report.push('\n**Login failed — authenticated sweep skipped.**\n');
		writeFileSync(OUT, report.join('\n'));
		await browser.close();
		return;
	}

	const cookies = (await context.cookies()).filter((c) => /session|auth/i.test(c.name));
	report.push('## Session cookies\n', cookies.map((c) => `- ${c.name}: httpOnly=${c.httpOnly} sameSite=${c.sameSite} secure=${c.secure}`).join('\n'), '');

	const app = [];
	for (const r of [...APP_ROUTES, ...ADMIN_ROUTES]) app.push(await visit(page, r));
	report.push('## Authenticated routes\n', table(app), '');

	const responsive = [];
	for (const [w, hgt] of VIEWPORTS) {
		await page.setViewportSize({ width: w, height: hgt });
		for (const r of ['/', '/dashboard', '/invoices', '/reminders', '/budgets']) {
			const res = await visit(page, r);
			if (res.overflowPx > 0 || res.smallTapTargets > 0) {
				responsive.push(`- ${w}px \`${r}\`: overflow=${res.overflowPx}px, tapTargets<32px=${res.smallTapTargets}`);
			}
		}
	}
	await page.setViewportSize({ width: 1280, height: 720 });
	report.push('## Responsive\n', responsive.length ? responsive.join('\n') : '- No horizontal overflow or undersized tap targets found', '');

	const badIds = [];
	for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid', '999999', "1' OR '1'='1"]) {
		const res = await page.goto(`${BASE}/invoice/${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
		badIds.push(`- \`${id}\` → ${res.status()} at \`${path(page.url())}\`${res.status() >= 500 ? ' **← should be 400/404**' : ''}`);
	}
	report.push('## Malformed route params\n', badIds.join('\n'), '');

	writeFileSync(OUT, report.join('\n'));
	await browser.close();
	console.log(`qa-browser-sweep: wrote ${OUT}`);
};

run().catch((e) => { console.error('qa-browser-sweep failed:', e.message); process.exit(1); });
