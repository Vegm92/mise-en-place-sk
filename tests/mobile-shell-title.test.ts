/**
 * Issue #660 — the mobile app shell.
 *
 * Three defects, three groups of assertions:
 *   1. Several `(app)` routes never set a `title`, so the shell header falls
 *      back to the app name ("Mise en Place") instead of naming the page.
 *   2. `/invoice/[id]` builds its title from an English template literal, so an
 *      `es-ES` session renders "Invoice F-2024-001" in the header.
 *   3. `MobileTabBar.svelte` / `MobilePageHeader.svelte` are imported nowhere.
 *
 * The 390px truncation itself is measured in a real browser by
 * `scripts/check-header-title-fit.mjs`; what is checkable without a browser is
 * that the header has a mobile branch at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { translations } from '../src/lib/i18n-messages';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const APP_ROUTES = path.join(SRC, 'routes', '(app)');
const MOBILE_DIR = path.join(SRC, 'lib', 'components', 'mobile');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full);
	}
	return out;
}

/** Every directory under `(app)` that renders a page. */
function pageDirs(): string[] {
	return walk(APP_ROUTES)
		.filter((f) => path.basename(f) === '+page.svelte')
		.map((f) => path.dirname(f))
		.sort();
}

/** The route path a page directory serves, e.g. `/analytics/spend`. */
function routeOf(dir: string): string {
	const rel = path.relative(APP_ROUTES, dir).split(path.sep).filter(Boolean);
	return '/' + rel.join('/');
}

/**
 * The i18n key a route hands to the shell header. The shell reads
 * `page.data.title` and resolves it through `t`, so anything that is not a
 * single-quoted key (a template literal, a missing load) yields null here.
 */
function titleKeyOf(dir: string): string | null {
	for (const file of ['+page.server.ts', '+page.ts']) {
		const full = path.join(dir, file);
		if (!existsSync(full)) continue;
		const match = readFileSync(full, 'utf8').match(/(?:^|[^\w.'])title:\s*'([^']*)'/);
		if (match) return match[1];
	}
	return null;
}

const KEY_SHAPE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

describe('issue #660 — every (app) route names itself in the shell header', () => {
	const dirs = pageDirs();

	it('finds the app routes', () => {
		expect(dirs.length).toBeGreaterThan(15);
	});

	for (const dir of dirs) {
		const route = routeOf(dir);

		it(`${route} resolves a title instead of falling back to the app name`, () => {
			const key = titleKeyOf(dir);
			expect(
				key,
				`${route} returns no i18n \`title\` from its load, so the header shows "Mise en Place".`,
			).not.toBeNull();
			expect(key, `${route}: \`title\` must be an i18n key, not literal copy.`).toMatch(KEY_SHAPE);
			expect(
				translations.es[key as keyof typeof translations.es],
				`${route}: no Spanish string for "${key}".`,
			).toBeTruthy();
			expect(
				translations.en[key as keyof typeof translations.en],
				`${route}: no English string for "${key}".`,
			).toBeTruthy();
		});
	}
});

describe('issue #660 — /invoice/[id] goes through i18n', () => {
	const server = path.join(APP_ROUTES, 'invoice', '[id]', '+page.server.ts');
	const source = () => readFileSync(server, 'utf8');

	it('does not build its title from an English literal', () => {
		expect(source()).not.toMatch(/title:\s*[`'"].*Invoice/);
	});

	it('names the invoice through a translated, interpolated key', () => {
		const key = titleKeyOf(path.dirname(server));
		expect(key).toMatch(KEY_SHAPE);
		const es = translations.es[key as keyof typeof translations.es] as string;
		const en = translations.en[key as keyof typeof translations.en] as string;
		expect(es).toBeTruthy();
		expect(en).toBeTruthy();
		expect(es, `"${key}" must interpolate the invoice number.`).toContain('{number}');
		expect(en, `"${key}" must interpolate the invoice number.`).toContain('{number}');
		expect(es).not.toBe(en);
		expect(es.toLowerCase()).not.toContain('invoice');
	});

	it('passes the invoice number to the shell as title params', () => {
		expect(source()).toMatch(/titleParams:\s*\{/);
	});

	it('the shell interpolates title params', () => {
		const layout = readFileSync(path.join(APP_ROUTES, '+layout.svelte'), 'utf8');
		expect(layout).toMatch(/titleParams/);
	});
});

describe('issue #660 — no dead components under src/lib/components/mobile', () => {
	const componentNames = existsSync(MOBILE_DIR)
		? readdirSync(MOBILE_DIR).filter((f) => f.endsWith('.svelte'))
		: [];

	const importers = walk(SRC)
		.filter((f) => !f.startsWith(MOBILE_DIR) && /\.(svelte|ts)$/.test(f))
		.map((f) => readFileSync(f, 'utf8'))
		.join('\n');

	it('still has mobile components to check', () => {
		expect(componentNames.length).toBeGreaterThan(0);
	});

	for (const name of componentNames) {
		it(`${name} is imported by something outside components/mobile`, () => {
			expect(
				importers.includes(name),
				`${name} is imported nowhere — adopt it or delete it.`,
			).toBe(true);
		});
	}
});

describe('issue #660 — the shell header has a mobile branch', () => {
	const layout = readFileSync(path.join(APP_ROUTES, '+layout.svelte'), 'utf8');
	const header = layout.slice(layout.indexOf('<header'), layout.indexOf('</header>'));
	const css = readFileSync(path.join(SRC, 'app.css'), 'utf8');

	it('reads a header', () => {
		expect(header).toContain('{pageTitle}');
	});

	it('does not pin the page title to one inline font size', () => {
		const h1 = header.slice(header.indexOf('<h1'), header.indexOf('</h1>'));
		expect(h1, 'the title needs a size that can change below md').not.toMatch(/font-size:/);
	});

	it('sizes the page title from the type scale, smaller below md', () => {
		const rule = css.match(/\.shell-title\s*\{[^}]*\}/);
		expect(rule, 'app.css must define .shell-title').not.toBeNull();
		expect(rule![0]).toMatch(/font-size:\s*16px/);
		const desktop = css.match(/@media\s*\(min-width:\s*768px\)\s*\{\s*\.shell-title\s*\{[^}]*\}/);
		expect(desktop, '.shell-title must grow back to 20px at md').not.toBeNull();
		expect(desktop![0]).toMatch(/font-size:\s*20px/);
	});

	it('keeps the locale and theme toggles out of the mobile header row', () => {
		const menuAt = header.indexOf('class="acct-menu"');
		expect(menuAt, 'the header must carry an account menu').toBeGreaterThan(-1);
		for (const handler of ['toggleLocale', 'toggleTheme']) {
			const at = header.indexOf(`onclick={${handler}}`);
			expect(at, `${handler} control not found in the header`).toBeGreaterThan(-1);
			expect(
				at > menuAt,
				`${handler} must sit inside the account menu, not loose in the header row`,
			).toBe(true);
		}
		expect(
			header.slice(0, menuAt),
			'the account menu must hang off a trigger that is hidden below md',
		).toMatch(/class="hidden md:block"/);
	});

	it('stacks the active location above the title below md', () => {
		expect(header, 'the header must render the location eyebrow').toMatch(
			/class="shell-eyebrow"/,
		);
		expect(header, 'the eyebrow and title must share one heading block').toMatch(
			/class="shell-heading"/,
		);
		const eyebrow = css.match(/\.shell-eyebrow\s*\{[^}]*\}/);
		expect(eyebrow, 'app.css must define .shell-eyebrow').not.toBeNull();
		expect(eyebrow![0], 'the eyebrow sits at the bottom of the type scale').toMatch(
			/font-size:\s*11px/,
		);
		const hiddenAt = css.indexOf('.shell-eyebrow { display: none; }');
		expect(hiddenAt, 'the eyebrow must be switched off somewhere').toBeGreaterThan(-1);
		expect(
			css.slice(css.lastIndexOf('@media', hiddenAt), hiddenAt),
			'the eyebrow is mobile-only — desktop already shows the location in the sidebar',
		).toMatch(/@media\s*\(min-width:\s*768px\)/);
	});

	it('gives the primary action its label back', () => {
		const upload = header.slice(header.indexOf('btn btn-primary'));
		expect(
			upload.slice(0, upload.indexOf('</a>')),
			'the upload button must carry a label, not just an icon',
		).toMatch(/t\('upload\.btn'\)/);
		expect(
			css,
			'only icon-only header controls give their padding back to the title',
		).toMatch(/\.app-header \.btn-icon\s*\{\s*padding-left:\s*0/);
	});

	it('condenses the header once the page scrolls', () => {
		expect(header, 'the header takes a condensed modifier').toMatch(/is-condensed/);
		const rule = css.match(/\.shell-header\.is-condensed\s*\{[^}]*\}/);
		expect(rule, 'app.css must define the condensed height').not.toBeNull();
		expect(rule![0]).toMatch(/height:\s*48px/);
	});
});
