/**
 * Admin console at phone width (issue #657).
 *
 * Two halves:
 *
 *  - a measured half, asserting the report written by
 *    `scripts/admin-mobile-audit.mjs`, which loads all seven admin routes in
 *    Chromium at 390px as a real admin user and records, per <table>, whether
 *    its content is clipped (renders wider than the box containing it, with
 *    nothing in between able to scroll to reveal the rest);
 *  - a static half, so a new unwrapped <table> is caught without a browser.
 *
 * The report is committed. It is tied to the source below — the table count in
 * the report has to match the number of tables in the routes — so adding a
 * table without re-running the audit fails here rather than passing silently.
 *
 *   node scripts/admin-mobile-audit-seed.mjs
 *   npx vite dev --port 5207 --host 127.0.0.1
 *   node scripts/admin-mobile-audit.mjs --tag=after
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const ADMIN_DIR = path.join(ROOT, 'src/routes/(admin)');
const REPORT_PATH = path.join(ROOT, 'shots/admin-mobile-audit.json');

const ADMIN_ROUTES = [
	'/admin',
	'/admin/access',
	'/admin/revenue',
	'/admin/events',
	'/admin/dead-letters',
	'/admin/errors',
	'/admin/learning',
	'/admin/health',
];

const SCROLLER = 'AdminTableScroll';

type TableMeasurement = {
	index: number;
	label: string;
	columns: number;
	renderedWidth: number;
	containerWidth: number;
	overflowPx: number;
	containerKind: string;
	scrollable: boolean;
	clipped: boolean;
};

type Report = {
	viewport: { width: number; height: number };
	totals: { routes: number; tables: number; clipped: number };
	routes: Array<{
		route: string;
		tables: TableMeasurement[];
		tableCount: number;
		clippedCount: number;
		documentOverflowPx: number;
	}>;
};

function svelteFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) svelteFiles(full, out);
		else if (entry.endsWith('.svelte')) out.push(full);
	}
	return out;
}

/** Every `<table>` in the file that is not inside an `<AdminTableScroll>` block. */
function unwrappedTables(source: string): number[] {
	const marks: Array<{ at: number; kind: 'open' | 'close' | 'table' }> = [];
	for (const m of source.matchAll(new RegExp(`<${SCROLLER}[\\s>]`, 'g'))) marks.push({ at: m.index, kind: 'open' });
	for (const m of source.matchAll(new RegExp(`</${SCROLLER}>`, 'g'))) marks.push({ at: m.index, kind: 'close' });
	for (const m of source.matchAll(/<table[\s>]/g)) marks.push({ at: m.index, kind: 'table' });
	marks.sort((a, b) => a.at - b.at);

	const unwrapped: number[] = [];
	let depth = 0;
	for (const mark of marks) {
		if (mark.kind === 'open') depth++;
		else if (mark.kind === 'close') depth--;
		else if (depth === 0) unwrapped.push(mark.at);
	}
	return unwrapped;
}

function lineOf(source: string, offset: number): number {
	return source.slice(0, offset).split('\n').length;
}

function sourceTableCount(): number {
	return svelteFiles(ADMIN_DIR)
		.reduce((n, file) => n + [...readFileSync(file, 'utf8').matchAll(/<table[\s>]/g)].length, 0);
}

describe('admin console tables at 390px', () => {
	it('has every admin table inside a horizontal scroll wrapper', () => {
		const offenders: string[] = [];
		for (const file of svelteFiles(ADMIN_DIR)) {
			const source = readFileSync(file, 'utf8');
			for (const at of unwrappedTables(source)) {
				offenders.push(`${path.relative(ROOT, file)}:${lineOf(source, at)}`);
			}
		}
		expect(
			offenders,
			`admin tables outside <${SCROLLER}>: ${offenders.join(', ')}. ` +
				'Wrap the table so its columns can be reached by scrolling on a phone.',
		).toEqual([]);
	});

	it('has a committed 390px audit report covering every admin route', () => {
		expect(
			existsSync(REPORT_PATH),
			'shots/admin-mobile-audit.json is missing — re-run scripts/admin-mobile-audit.mjs.',
		).toBe(true);

		const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as Report;
		expect(report.viewport.width).toBe(390);
		expect(report.routes.map(r => r.route).sort()).toEqual([...ADMIN_ROUTES].sort());
		expect(
			report.totals.tables,
			'the audit measured a different number of tables than the routes contain — re-run scripts/admin-mobile-audit.mjs.',
		).toBe(sourceTableCount());
	});

	it('clips no admin table at 390px', () => {
		const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as Report;
		const clipped = report.routes.flatMap(r =>
			r.tables
				.filter(t => t.clipped)
				.map(t => `${r.route} [${t.index}] ${t.label} (${t.renderedWidth}px in ${t.containerWidth}px, ` +
					`${t.overflowPx}px unreachable)`),
		);
		expect(clipped, `clipped admin tables at 390px: ${clipped.join(' | ')}`).toEqual([]);
	});

	it('leaves no admin route scrolling horizontally at 390px', () => {
		const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as Report;
		const overflowing = report.routes
			.filter(r => r.documentOverflowPx > 1)
			.map(r => `${r.route} (+${r.documentOverflowPx}px)`);
		expect(overflowing, `admin routes wider than the viewport: ${overflowing.join(', ')}`).toEqual([]);
	});
});
