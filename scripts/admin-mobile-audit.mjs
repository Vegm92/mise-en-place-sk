// Admin console mobile audit (issue #657).
//
// Loads every admin route at a phone width as a real admin user and reports, per
// route, every <table> whose content is clipped — i.e. it renders wider than the
// box that contains it and no ancestor between the two can scroll to reveal the
// rest. Writes a JSON report that tests/admin-mobile-tables.test.ts asserts on,
// plus one full-page screenshot per route.
//
// Prerequisites: a dev server, and a database seeded by
// scripts/admin-mobile-audit-seed.mjs (admin user + rows for every table).
//
//   node scripts/admin-mobile-audit-seed.mjs
//   npx vite dev --port 5207 --host 127.0.0.1
//   node scripts/admin-mobile-audit.mjs --tag=after
//
// Options:
//   --base=http://127.0.0.1:5207   dev server origin
//   --width=390                    viewport width (390 = iPhone 12/13/14)
//   --tag=before                   screenshot filename prefix
//   --out=shots                    screenshot directory
//   --report=tests/fixtures/admin-mobile-audit.json   report path ('' to skip)
//   --email= / --password=         admin credentials (default: .env values)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnvFile() {
	try {
		for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
			const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
			if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
		}
	} catch { /* no .env — rely on the ambient environment */ }
}

loadEnvFile();

const args = Object.fromEntries(
	process.argv.slice(2).map(a => {
		const [k, ...rest] = a.replace(/^--/, '').split('=');
		return [k, rest.join('=')];
	}),
);

const BASE = args.base ?? 'http://127.0.0.1:5207';
const WIDTH = Number(args.width ?? 390);
const HEIGHT = Number(args.height ?? 844);
const TAG = args.tag ?? 'audit';
const OUT = path.resolve(ROOT, args.out ?? 'shots');
const REPORT = args.report === undefined
	? path.resolve(ROOT, 'tests/fixtures/admin-mobile-audit.json')
	: (args.report ? path.resolve(ROOT, args.report) : '');
const EMAIL = args.email ?? process.env.AUTH_ADMIN_EMAIL ?? 'admin@mep.test';
const PASSWORD = args.password ?? process.env.AUTH_ADMIN_PASSWORD ?? 'Test1234!';
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export const ADMIN_ROUTES = [
	'/admin',
	'/admin/access',
	'/admin/revenue',
	'/admin/events',
	'/admin/dead-letters',
	'/admin/errors',
	'/admin/learning',
	'/admin/health',
];

// Runs in the page. A table is "clipped" when the nearest ancestor that limits
// its horizontal extent hides the overflow instead of scrolling it.
function measureTables() {
	const round = n => Math.round(n * 10) / 10;

	return [...document.querySelectorAll('table')].map((table, index) => {
		const rendered = table.getBoundingClientRect().width;
		const columns = Math.max(
			...[...table.rows].map(r => [...r.cells].reduce((n, c) => n + (c.colSpan || 1), 0)),
			0,
		);

		let scroller = null;
		let clipper = null;
		let el = table.parentElement;
		while (el && el !== document.documentElement) {
			const overflowX = getComputedStyle(el).overflowX;
			if (overflowX === 'auto' || overflowX === 'scroll') { scroller = el; break; }
			if (overflowX === 'hidden' || overflowX === 'clip') { clipper = el; break; }
			el = el.parentElement;
		}

		const container = scroller ?? clipper ?? document.documentElement;
		const containerWidth = container.clientWidth;
		const overflowPx = round(Math.max(0, rendered - containerWidth));

		const scrollable = scroller !== null && scroller.scrollWidth > scroller.clientWidth;
		const canReveal = clipper !== null
			? false
			: (scroller !== null
				? scroller.scrollWidth + 1 >= rendered
				: document.documentElement.scrollWidth + 1 >= rendered);

		let caption = table.closest('.card')?.querySelector('.section-title')?.textContent?.trim() ?? '';
		if (!caption) caption = [...table.querySelectorAll('th')].map(th => th.textContent.trim()).join(' / ');

		return {
			index,
			label: caption.slice(0, 60),
			columns,
			renderedWidth: round(rendered),
			containerWidth: round(containerWidth),
			overflowPx,
			containerKind: scroller ? 'scroller' : (clipper ? 'clip' : 'document'),
			scrollable,
			clipped: overflowPx > 1 && !canReveal,
		};
	});
}

function measurePage() {
	const doc = document.documentElement;
	return {
		documentOverflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
		hasMdBranchStyles: null,
	};
}

async function main() {
	mkdirSync(OUT, { recursive: true });

	const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
	const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });

	const login = await context.request.post(`${BASE}/login?/signIn`, {
		headers: { 'x-sveltekit-action': 'true', 'content-type': 'application/x-www-form-urlencoded' },
		data: `email=${encodeURIComponent(EMAIL)}&password=${encodeURIComponent(PASSWORD)}`,
	});
	const loginBody = await login.text();
	if (!loginBody.includes('redirect')) {
		throw new Error(`login failed for ${EMAIL}: ${login.status()} ${loginBody.slice(0, 200)}`);
	}

	const page = await context.newPage();
	const routes = [];

	for (const route of ADMIN_ROUTES) {
		const response = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
		const landed = new URL(page.url()).pathname;
		if (landed !== route) {
			throw new Error(`${route} redirected to ${landed} — is ${EMAIL} in AUTH_ADMIN_EMAIL?`);
		}
		if (!response.ok()) throw new Error(`${route} returned ${response.status()}`);

		const tables = await page.evaluate(measureTables);
		const pageInfo = await page.evaluate(measurePage);
		const slug = route.replace(/\//g, '_').replace(/^_/, '');
		const shot = path.join(OUT, `${TAG}-${WIDTH}-${slug}.png`);
		await page.screenshot({ path: shot, fullPage: true });

		routes.push({
			route,
			tables,
			tableCount: tables.length,
			clippedCount: tables.filter(t => t.clipped).length,
			documentOverflowPx: pageInfo.documentOverflowPx,
			screenshot: path.relative(ROOT, shot),
		});

		const flag = routes.at(-1).clippedCount > 0 ? 'CLIPPED' : 'ok';
		console.log(
			`${route.padEnd(20)} tables=${String(tables.length).padStart(2)} ` +
			`clipped=${String(routes.at(-1).clippedCount).padStart(2)} ` +
			`pageOverflow=${String(pageInfo.documentOverflowPx).padStart(4)}px  ${flag}`,
		);
		for (const t of tables) {
			console.log(
				`    [${t.index}] ${t.label || '(untitled)'} — ${t.columns} cols, ` +
				`${t.renderedWidth}px in ${t.containerWidth}px ${t.containerKind}` +
				`${t.overflowPx ? `, overflow ${t.overflowPx}px` : ''}` +
				`${t.clipped ? ' → CLIPPED' : (t.scrollable ? ' → scrolls' : '')}`,
			);
		}
	}

	const report = {
		generatedAt: new Date().toISOString(),
		base: BASE,
		viewport: { width: WIDTH, height: HEIGHT },
		tag: TAG,
		totals: {
			routes: routes.length,
			tables: routes.reduce((n, r) => n + r.tableCount, 0),
			clipped: routes.reduce((n, r) => n + r.clippedCount, 0),
		},
		routes,
	};

	if (REPORT) {
		mkdirSync(path.dirname(REPORT), { recursive: true });
		writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
		console.log(`\nreport → ${path.relative(ROOT, REPORT)}`);
	}
	console.log(`totals: ${report.totals.tables} tables, ${report.totals.clipped} clipped, at ${WIDTH}px`);

	await browser.close();
	process.exitCode = report.totals.clipped > 0 ? 1 : 0;
}

main().catch(e => {
	console.error(e);
	process.exit(2);
});
