/**
 * Regression test for issue #543: all seven (now eight) /admin pages rendered
 * an empty <title> — the (admin) route group has its own layout that never
 * declared a <svelte:head>, unlike the (app) group's `page.data.title` →
 * `<svelte:head><title>` convention. This statically scans the route sources
 * (no component-render infra available in this suite, same approach as
 * tests/mobile-shell-title.test.ts and tests/batch-review-a11y.test.ts) and
 * asserts every /admin/* page resolves a distinct, non-empty title, renders
 * at most one <h1>, and gives every table header a `scope`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'svelte/compiler';
import { translations } from '../src/lib/i18n-messages';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ADMIN_ROUTES = path.join(SRC, 'routes', '(admin)');
const LAYOUT = path.join(ADMIN_ROUTES, '+layout.svelte');
const ADMIN_PAGE_HEAD = path.join(SRC, 'lib', 'components', 'admin', 'AdminPageHead.svelte');

function walkDir(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) walkDir(full, out);
		else out.push(full);
	}
	return out;
}

/** Every directory under `(admin)` that renders a page. */
function pageDirs(): string[] {
	return walkDir(ADMIN_ROUTES)
		.filter((f) => path.basename(f) === '+page.svelte')
		.map((f) => path.dirname(f))
		.sort();
}

/** The route path a page directory serves, e.g. `/admin/revenue`. */
function routeOf(dir: string): string {
	const rel = path.relative(ADMIN_ROUTES, dir).split(path.sep).filter(Boolean);
	return '/' + rel.join('/');
}

/**
 * The i18n key a route hands to the (admin) layout. The layout reads
 * `page.data.title` and resolves it through `$t`, so anything that is not a
 * single-quoted key (a template literal, a missing load) yields null here.
 */
function titleKeyOf(dir: string): string | null {
	const full = path.join(dir, '+page.server.ts');
	try {
		const source = readFileSync(full, 'utf8');
		const match = source.match(/(?:^|[^\w.'])title:\s*'([^']*)'/);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

const KEY_SHAPE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

type AstNode = Record<string, unknown> & { type?: string };

function walkAst(node: unknown, visit: (n: AstNode) => void): void {
	if (!node || typeof node !== 'object') return;
	const n = node as AstNode;
	if (typeof n.type === 'string') visit(n);
	for (const key of Object.keys(n)) {
		if (key === 'parent') continue;
		const value = n[key];
		if (Array.isArray(value)) value.forEach((child) => walkAst(child, visit));
		else if (value && typeof value === 'object') walkAst(value, visit);
	}
}

function collectElements(ast: ReturnType<typeof parse>, name: string): AstNode[] {
	const out: AstNode[] = [];
	walkAst(ast.fragment, (n) => {
		if (n.type === 'RegularElement' && n.name === name) out.push(n);
	});
	return out;
}

function collectComponents(ast: ReturnType<typeof parse>, name: string): AstNode[] {
	const out: AstNode[] = [];
	walkAst(ast.fragment, (n) => {
		if (n.type === 'Component' && n.name === name) out.push(n);
	});
	return out;
}

function findAttr(el: AstNode, attrName: string): AstNode | undefined {
	const attrs = (el.attributes as AstNode[] | undefined) ?? [];
	return attrs.find((a) => a.type === 'Attribute' && a.name === attrName);
}

describe('issue #543 — every /admin route names itself in the tab title', () => {
	const dirs = pageDirs();

	it('finds the admin routes', () => {
		expect(dirs.length).toBeGreaterThanOrEqual(7);
	});

	it('the (admin) layout declares a <svelte:head><title>', () => {
		const layout = readFileSync(LAYOUT, 'utf8');
		expect(layout, 'the layout must reactively derive a page title').toMatch(
			/page\.data\.title/,
		);
		expect(layout).toMatch(/<svelte:head>\s*<title>\{pageTitle\}<\/title>\s*<\/svelte:head>/);
	});

	const seenKeys = new Map<string, string>();

	for (const dir of dirs) {
		const route = routeOf(dir);

		it(`${route} resolves a title instead of rendering empty`, () => {
			const key = titleKeyOf(dir);
			expect(
				key,
				`${route} returns no i18n \`title\` from its load, so <title> renders empty.`,
			).not.toBeNull();
			expect(key, `${route}: \`title\` must be an i18n key, not literal copy.`).toMatch(
				KEY_SHAPE,
			);
			expect(
				translations.es[key as keyof typeof translations.es],
				`${route}: no Spanish string for "${key}".`,
			).toBeTruthy();
			expect(
				translations.en[key as keyof typeof translations.en],
				`${route}: no English string for "${key}".`,
			).toBeTruthy();

			const prior = seenKeys.get(key as string);
			expect(prior, `${route} shares its title key "${key}" with ${prior}`).toBeUndefined();
			seenKeys.set(key as string, route);
		});
	}
});

describe('issue #543 — every /admin page renders at most one h1', () => {
	const dirs = pageDirs();
	const headSource = readFileSync(ADMIN_PAGE_HEAD, 'utf8');
	const headAst = parse(headSource, { modern: true, filename: ADMIN_PAGE_HEAD });

	it('AdminPageHead.svelte (the shared page heading) renders exactly one h1', () => {
		expect(collectElements(headAst, 'h1')).toHaveLength(1);
	});

	it('the (admin) layout renders no h1 of its own', () => {
		const layout = readFileSync(LAYOUT, 'utf8');
		const layoutAst = parse(layout, { modern: true, filename: LAYOUT });
		expect(collectElements(layoutAst, 'h1')).toHaveLength(0);
	});

	for (const dir of dirs) {
		const route = routeOf(dir);
		const file = path.join(dir, '+page.svelte');
		const source = readFileSync(file, 'utf8');
		const ast = parse(source, { modern: true, filename: file });

		it(`${route} uses exactly one heading source (no duplicate h1)`, () => {
			const literalH1s = collectElements(ast, 'h1');
			expect(literalH1s, `${route}: page markup must not add its own <h1>`).toHaveLength(0);

			const headUsages = collectComponents(ast, 'AdminPageHead');
			expect(
				headUsages.length,
				`${route}: must render <AdminPageHead> exactly once for its h1`,
			).toBe(1);
		});
	}
});

describe('issue #543 — every table header in /admin pages carries scope', () => {
	const dirs = pageDirs();

	for (const dir of dirs) {
		const route = routeOf(dir);
		const file = path.join(dir, '+page.svelte');
		const source = readFileSync(file, 'utf8');
		const ast = parse(source, { modern: true, filename: file });
		const ths = collectElements(ast, 'th');

		if (ths.length === 0) continue;

		it(`${route}: every <th> has a non-empty scope attribute`, () => {
			const failures: string[] = [];
			for (const th of ths) {
				const scope = findAttr(th, 'scope');
				const value = scope?.value;
				const raw = Array.isArray(value)
					? value.map((v) => (v as AstNode).data ?? '').join('')
					: typeof value === 'string'
						? value
						: '';
				if (!scope || !raw || !/^(col|row)$/.test(raw)) {
					failures.push(`<th> at line ${source.slice(0, th.start as number).split('\n').length}`);
				}
			}
			expect(failures, `unscoped headers:\n${failures.join('\n')}`).toEqual([]);
		});
	}
});
