/**
 * Horizontal-scroll affordance (issue #658).
 *
 * Two layers:
 *
 *   1. A measured layer. `scripts/scroll-strip-audit.mjs` drives the running
 *      app with Playwright at 390px, records every horizontally overflowing
 *      strip per route, and writes the report this test asserts on. Re-run the
 *      harness to refresh it:
 *
 *        BATCH_ID=<uuid> node scripts/scroll-strip-audit.mjs
 *
 *   2. A static guard, so a new `overflow-x: auto` strip that skips the shared
 *      affordance is caught without a browser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const REPORT = process.env.SCROLL_STRIP_REPORT
	? path.resolve(ROOT, process.env.SCROLL_STRIP_REPORT)
	: path.join(ROOT, 'tests', 'fixtures', 'scroll-strip-audit.json');

const APP_CSS = readFileSync(path.join(SRC, 'app.css'), 'utf8');

type Strip = {
	selector: string;
	kind: 'scrollable' | 'clipped';
	scrollWidth: number;
	clientWidth: number;
	viewportRatio: number;
	hasAffordance: boolean;
	altEntry: boolean;
	usesSharedStrip: boolean;
	ok: boolean;
	reasons: string[];
	lastItem: string;
};
type Report = {
	viewportWidth: number;
	maxViewportRatio: number;
	routes: Array<{ route: string; strips: Strip[] }>;
};

function loadReport(): Report {
	expect(
		existsSync(REPORT),
		`no audit report at ${path.relative(ROOT, REPORT)} — run ` +
			'`BATCH_ID=<uuid> node scripts/scroll-strip-audit.mjs` against a running dev server.',
	).toBe(true);
	return JSON.parse(readFileSync(REPORT, 'utf8')) as Report;
}

function describeStrip(route: string, s: Strip): string {
	return (
		`${route} ${s.selector}: scrollWidth ${s.scrollWidth}px vs clientWidth ${s.clientWidth}px ` +
		`(${s.viewportRatio}x viewport, last item "${s.lastItem}") — ${s.reasons.join('; ')}`
	);
}

/**
 * Files allowed to declare horizontal scrolling without the shared strip, and
 * why. Anything else has to go through `<ScrollStrip>` / `.scroll-strip`.
 */
const NON_STRIP_SCROLLERS: Record<string, string> = {
	'src/lib/components/desktop/DesktopDashboard.svelte':
		'desktop-only tables; the pointer platform paints a real scrollbar',
	'src/routes/(app)/suppliers/+page.svelte':
		'desktop-only supplier table; the pointer platform paints a real scrollbar',
	'src/lib/components/mep/TrendLineChart.svelte':
		'plot area — an edge fade would wash out the most recent data points',
	'src/lib/components/admin/AdminTableScroll.svelte':
		'admin data tables (issue #657) — a mask over cells would hide their content, and the scrollbar is the affordance',
	'src/routes/(admin)/+layout.svelte':
		'admin nav rail (issue #657) — scrolls only below md, and a fade would sit under the header border',
};

const HORIZONTAL_SCROLL = /overflow-x\s*:\s*(auto|scroll)|(?:^|["'\s])overflow-x-auto(?:["'\s]|$)/;

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (entry.endsWith('.svelte')) out.push(full);
	}
	return out;
}

describe('scroll strips indicate that there is more content (issue #658)', () => {
	it('every horizontally scrolling strip carries a visible affordance', () => {
		const report = loadReport();
		const offenders: string[] = [];
		for (const { route, strips } of report.routes) {
			for (const s of strips) {
				if (!s.hasAffordance) offenders.push(describeStrip(route, s));
			}
		}
		expect(offenders, `strips with no fade and no scrollbar:\n${offenders.join('\n')}`).toEqual([]);
	});

	it('no strip runs past ~3x the viewport without an alternative entry point', () => {
		const report = loadReport();
		const offenders = report.routes.flatMap(({ route, strips }) =>
			strips
				.filter((s) => s.viewportRatio > report.maxViewportRatio && !s.altEntry)
				.map((s) => describeStrip(route, s)),
		);
		expect(offenders, `over-long strips:\n${offenders.join('\n')}`).toEqual([]);
	});

	it('nothing is clipped out of reach with no way to scroll to it', () => {
		const report = loadReport();
		const offenders = report.routes.flatMap(({ route, strips }) =>
			strips.filter((s) => s.kind === 'clipped').map((s) => describeStrip(route, s)),
		);
		expect(offenders, `clipped rows:\n${offenders.join('\n')}`).toEqual([]);
	});

	it('covers the four screens the issue measured, at 390px', () => {
		const report = loadReport();
		expect(report.viewportWidth).toBe(390);
		const routes = report.routes.map((r) => r.route);
		expect(routes).toContain('/suppliers');
		expect(routes).toContain('/invoices');
		expect(routes.some((r) => /^\/suppliers\/\d+$/.test(r))).toBe(true);
		expect(routes.some((r) => r.startsWith('/batch/'))).toBe(true);
	});

	it('routes the measured strips through the shared component', () => {
		const report = loadReport();
		const chipStrips = report.routes.flatMap(({ route, strips }) =>
			strips.filter((s) => s.kind === 'scrollable').map((s) => ({ route, s })),
		);
		expect(chipStrips.length).toBeGreaterThan(0);
		for (const { route, s } of chipStrips) {
			expect(s.usesSharedStrip, `${route} ${s.selector} is not a .scroll-strip`).toBe(true);
		}
	});
});

describe('the shared scroll strip', () => {
	it('exists as one class with an edge fade and lead-in padding', () => {
		expect(APP_CSS).toMatch(/\.scroll-strip\s*\{/);
		const block = APP_CSS.slice(APP_CSS.indexOf('.scroll-strip {')).slice(0, 1600);
		expect(block).toMatch(/mask-image:\s*linear-gradient\(\s*to right/);
		expect(block).toMatch(/padding-left:/);
		expect(block).toMatch(/\.scroll-strip\[data-more-end='true'\]/);
		expect(block).toMatch(/\.scroll-strip\[data-more-start='true'\]/);
	});

	it('is backed by a component the call sites share', () => {
		const component = path.join(SRC, 'lib', 'components', 'mep', 'ScrollStrip.svelte');
		expect(existsSync(component), 'expected src/lib/components/mep/ScrollStrip.svelte').toBe(true);
		const src = readFileSync(component, 'utf8');
		expect(src).toContain('scroll-strip');
		expect(src).toMatch(/scrollWidth/);
	});

	it('is used by every chip strip the issue named', () => {
		const callSites = [
			'src/lib/components/mobile/MobileSuppliersList.svelte',
			'src/lib/components/mobile/MobileInvoiceList.svelte',
			'src/lib/components/mobile/MobileAnalyticsPrices.svelte',
			'src/routes/(app)/suppliers/[id]/+page.svelte',
		];
		for (const rel of callSites) {
			const src = readFileSync(path.join(ROOT, rel), 'utf8');
			expect(src, `${rel} should render <ScrollStrip>`).toContain('<ScrollStrip');
		}
	});

	it('keeps the batch footer totals on screen by wrapping them', () => {
		const block = APP_CSS.slice(APP_CSS.indexOf('.rev-foot-totals {'));
		expect(block.slice(0, 240)).toMatch(/flex-wrap:\s*wrap/);
	});
});

describe('static guard: no new bare horizontal scroller', () => {
	it('only the documented non-strip scrollers declare overflow-x themselves', () => {
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			const rel = path.relative(ROOT, file).split(path.sep).join('/');
			if (rel in NON_STRIP_SCROLLERS) continue;
			const src = readFileSync(file, 'utf8');
			for (const [i, line] of src.split('\n').entries()) {
				if (!HORIZONTAL_SCROLL.test(line)) continue;
				if (/scroll-strip/.test(line)) continue;
				offenders.push(`${rel}:${i + 1} ${line.trim().slice(0, 90)}`);
			}
		}
		expect(
			offenders,
			'a horizontally scrolling element must use <ScrollStrip> / .scroll-strip, or be ' +
				`listed in NON_STRIP_SCROLLERS with a reason:\n${offenders.join('\n')}`,
		).toEqual([]);
	});

	it('documents a reason for each exemption', () => {
		for (const [file, reason] of Object.entries(NON_STRIP_SCROLLERS)) {
			expect(existsSync(path.join(ROOT, file)), `stale exemption: ${file}`).toBe(true);
			expect(reason.length).toBeGreaterThan(20);
		}
	});
});
