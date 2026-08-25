/**
 * Acceptance gate for issue #659 — mobile tap targets and text size.
 *
 * Two layers:
 *
 *  1. The measured layer reads tests/fixtures/mobile-tap-targets.json, the report
 *     scripts/mobile-tap-target-audit.mjs writes after driving the real app at 390px with
 *     Playwright. Regenerate it with:
 *
 *         node scripts/seed-demo-data.mjs
 *         npx vite dev --port 5209 --host 127.0.0.1 &
 *         node scripts/mobile-tap-target-audit.mjs
 *
 *  2. The static layer reads the .svelte sources directly, so the two rules
 *     that a media query cannot enforce — inline `height:32px` on a component
 *     primitive, and an inline sub-16px font-size on an `.input` — cannot come
 *     back without a browser in the loop.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const REPORT = path.join(ROOT, 'tests/fixtures/mobile-tap-targets.json');

const TARGET_MIN_PX = 44;
const TEXT_MIN_PX = 11;
const INPUT_MIN_PX = 16;

/** Every app route with a fixed URL. Detail screens are covered too, under
 *  ids the harness reads off the list screens, so they are matched by shape. */
const AUDITED_ROUTES = [
	'/',
	'/dashboard',
	'/invoices',
	'/invoices/export',
	'/suppliers',
	'/products',
	'/budgets',
	'/reminders',
	'/settings',
	'/chat',
	'/billing',
	'/reports',
	'/plantilla-lista',
	'/analytics/spend',
	'/analytics/prices',
	'/analytics/extraction',
];

const AUDITED_DETAIL_SHAPES = [
	/^\/suppliers\/\d+$/,
	/^\/products\/\d+$/,
	/^\/invoice\/\d+$/,
	/^\/invoice\/\d+\/edit$/,
];

type Finding = { selector: string };
type RouteReport = {
	route: string;
	status: number;
	url: string;
	smallTargets: Array<Finding & { width: number; height: number }>;
	tinyText: Array<Finding & { fontSize: number; count: number }>;
	smallInputs: Array<Finding & { fontSize: number }>;
};
type Report = {
	generatedAt: string;
	viewport: { width: number; height: number };
	limits: { target: number; text: number; input: number };
	routes: RouteReport[];
};

const report: Report = JSON.parse(readFileSync(REPORT, 'utf8'));

function list(routes: RouteReport[], pick: (r: RouteReport) => Finding[], detail: (f: never) => string): string {
	const lines: string[] = [];
	for (const r of routes) {
		for (const f of pick(r).slice(0, 8)) lines.push(`  ${r.route}  ${detail(f as never)}  ${f.selector}`);
		const extra = pick(r).length - 8;
		if (extra > 0) lines.push(`  ${r.route}  …and ${extra} more`);
	}
	return lines.join('\n');
}

describe('mobile audit report', () => {
	it('was produced at the phone viewport the issue specifies', () => {
		expect(report.viewport).toEqual({ width: 390, height: 844 });
		expect(report.limits).toEqual({ target: TARGET_MIN_PX, text: TEXT_MIN_PX, input: INPUT_MIN_PX });
	});

	it('covers every app route, each rendered rather than redirected', () => {
		const covered = report.routes.map((r) => r.route);
		expect(covered).toEqual(expect.arrayContaining(AUDITED_ROUTES));
		for (const shape of AUDITED_DETAIL_SHAPES) {
			expect(covered.some((r) => shape.test(r)), `no route matching ${shape} was audited`).toBe(true);
		}
		for (const r of report.routes) {
			expect(r.status, `${r.route} did not render`).toBe(200);
			expect(r.url, `${r.route} redirected to ${r.url}`).toBe(r.route);
		}
	});
});

describe('mobile acceptance thresholds at 390px', () => {
	it(`has no interactive element under ${TARGET_MIN_PX}px`, () => {
		const offenders = report.routes.filter((r) => r.smallTargets.length > 0);
		const total = offenders.reduce((n, r) => n + r.smallTargets.length, 0);
		expect(
			total,
			`${total} tap targets under ${TARGET_MIN_PX}px:\n` +
				list(offenders, (r) => r.smallTargets, (f: RouteReport['smallTargets'][number]) => `${f.width}x${f.height}`),
		).toBe(0);
	});

	it(`has no user-facing text under ${TEXT_MIN_PX}px`, () => {
		const offenders = report.routes.filter((r) => r.tinyText.length > 0);
		const total = offenders.reduce((n, r) => n + r.tinyText.length, 0);
		expect(
			total,
			`${total} text styles under ${TEXT_MIN_PX}px:\n` +
				list(offenders, (r) => r.tinyText, (f: RouteReport['tinyText'][number]) => `${f.fontSize}px`),
		).toBe(0);
	});

	it(`has no form field under ${INPUT_MIN_PX}px, which would zoom iOS Safari on focus`, () => {
		const offenders = report.routes.filter((r) => r.smallInputs.length > 0);
		const total = offenders.reduce((n, r) => n + r.smallInputs.length, 0);
		expect(
			total,
			`${total} fields under ${INPUT_MIN_PX}px:\n` +
				list(offenders, (r) => r.smallInputs, (f: RouteReport['smallInputs'][number]) => `${f.fontSize}px`),
		).toBe(0);
	});
});

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (entry.endsWith('.svelte')) out.push(full);
	}
	return out;
}

type StartTag = { file: string; line: number; text: string };

/** Every element start tag, scanned with quote and brace awareness. */
function startTags(file: string, src: string): StartTag[] {
	const tags: StartTag[] = [];
	for (let i = 0; i < src.length; i++) {
		if (src[i] !== '<' || !/[a-zA-Z]/.test(src[i + 1] ?? '')) continue;
		let quote = '';
		let depth = 0;
		let j = i + 1;
		for (; j < src.length; j++) {
			const c = src[j];
			if (quote) {
				if (c === quote) quote = '';
				continue;
			}
			if (c === '"' || c === "'") quote = c;
			else if (c === '{') depth++;
			else if (c === '}') depth--;
			else if (c === '>' && depth === 0) break;
		}
		tags.push({ file, line: src.slice(0, i).split('\n').length, text: src.slice(i, j + 1) });
		i = j;
	}
	return tags;
}

function attr(tag: string, name: string): string | null {
	const m = tag.match(new RegExp(`\\b${name}=("([^"]*)"|'([^']*)')`));
	return m ? (m[2] ?? m[3] ?? '') : null;
}

function classesOf(tag: string): string[] {
	const raw = attr(tag, 'class');
	if (raw === null) return [];
	return raw.replace(/\{[^}]*\}/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function decl(style: string, prop: string): string | null {
	for (const part of style.split(';')) {
		const at = part.indexOf(':');
		if (at < 0) continue;
		if (part.slice(0, at).trim() === prop) return part.slice(at + 1).trim();
	}
	return null;
}

const ALL_TAGS = walk(SRC).flatMap((f) => startTags(path.relative(ROOT, f), readFileSync(f, 'utf8')));
const STYLED = ALL_TAGS.map((t) => ({ ...t, style: attr(t.text, 'style'), classes: classesOf(t.text) })).filter(
	(t): t is StartTag & { style: string; classes: string[] } => t.style !== null,
);

describe('static guards so the mobile rules cannot be overridden again', () => {
	it('has no inline height:32px, which pins a primitive to the mouse-sized default', () => {
		const offenders = STYLED.filter((t) => {
			const h = decl(t.style, 'height');
			return h !== null && /^32px$/.test(h);
		});
		expect(
			offenders.length,
			'inline height:32px re-pins .btn/.input to the desktop height — drop it and let the ' +
				'component class plus the max-md min-height rule size the control:\n' +
				offenders.map((t) => `  ${t.file}:${t.line}`).join('\n'),
		).toBe(0);
	});

	it(`has no inline font-size under ${INPUT_MIN_PX}px on a form field`, () => {
		const offenders = STYLED.filter((t) => {
			const name = t.text.match(/^<([a-zA-Z][\w:-]*)/)?.[1] ?? '';
			if (!['input', 'select', 'textarea'].includes(name) && !t.classes.includes('input')) return false;
			const fs = decl(t.style, 'font-size');
			if (fs === null) return false;
			const px = parseFloat(fs);
			return Number.isFinite(px) && fs.endsWith('px') && px < INPUT_MIN_PX;
		});
		expect(
			offenders.length,
			`an inline font-size beats the max-md rule that lifts .input to ${INPUT_MIN_PX}px, and iOS ` +
				'Safari then zooms the viewport on focus and never zooms back:\n' +
				offenders.map((t) => `  ${t.file}:${t.line}  ${decl(t.style, 'font-size')}`).join('\n'),
		).toBe(0);
	});

	it('keeps the max-md primitive block in app.css', () => {
		const css = readFileSync(path.join(SRC, 'app.css'), 'utf8');
		const block = css.slice(css.indexOf('@media (max-width: 767px)'));
		expect(block, 'src/app.css lost its mobile primitive block').not.toBe('');
		for (const rule of ['.btn', '.input', '.badge', '.label']) {
			expect(block.includes(rule), `${rule} is no longer lifted below md`).toBe(true);
		}
	});
});
