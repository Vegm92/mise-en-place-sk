/**
 * Every `var(--mep-*)` a component reads must actually be declared in
 * src/app.css.
 *
 * An undefined custom property does not fall back to anything sensible: the
 * declaration becomes invalid at computed-value time, so an inherited property
 * (color, font-family) silently resolves to `inherit` and a non-inherited one
 * (background, border) resolves to `initial` — transparent, or no border at
 * all. Nothing throws and nothing logs, so a typo'd token reads as a design
 * choice. This sweep found five live ones: --mep-card and --mep-accent left the
 * weekly-digest cards with no surface and no accent stripe, --mep-fg-soft left
 * the billing paused/canceled pills transparent, and --mep-fg-1 / --mep-font
 * quietly inherited.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { VALID_CATEGORIES, categorySlug } from '../src/lib/constants';
import { CATEGORY_COLORS, categoryColor, categoryTint } from '../src/lib/colors';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(svelte|ts|js|css)$/.test(entry)) out.push(full);
	}
	return out;
}

const css = readFileSync(path.join(SRC, 'app.css'), 'utf8');
const declared = new Set(
	[...css.matchAll(/(--mep-[a-z0-9-]+)\s*:/g)].map(m => m[1]),
);

const referencedIn = new Map<string, Set<string>>();
for (const file of walk(SRC)) {
	if (file.endsWith(`${path.sep}app.css`)) continue;
	const src = readFileSync(file, 'utf8');
	for (const m of src.matchAll(/var\(\s*(--mep-[a-z0-9-]+)(\$\{)?/g)) {
		if (m[2]) continue; // `var(--mep-cat-${slug})` — the name is built, not read
		const rel = path.relative(ROOT, file);
		if (!referencedIn.has(m[1]!)) referencedIn.set(m[1]!, new Set());
		referencedIn.get(m[1]!)!.add(rel);
	}
}

describe('MEP design tokens', () => {
	it('declares every --mep-* token referenced outside app.css', () => {
		const undeclared = [...referencedIn.entries()]
			.filter(([token]) => !declared.has(token))
			.map(([token, files]) => `${token} (${[...files].join(', ')})`);
		expect(undeclared).toEqual([]);
	});

	it('declares the foreground ramp and semantic inks for both themes', () => {
		const block = (sel: RegExp) => css.match(sel)?.[0] ?? '';
		const light = block(/:root\[data-theme=["']light["']\]\s*{[\s\S]*?\n}/);
		const dark = block(/:root\[data-theme=["']dark["']\]\s*{[\s\S]*?\n}/);
		for (const token of ['--mep-fg', '--mep-fg-2', '--mep-fg-3', '--mep-fg-4']) {
			expect(light).toContain(token);
			expect(dark).toContain(token);
		}
		// The inks default to white on :root (the light ramp) and are overridden
		// on the dark ramp, exactly like --mep-acc-fg.
		for (const token of ['--mep-pos-fg', '--mep-neg-fg', '--mep-warn-fg', '--mep-info-fg']) {
			expect(css).toMatch(new RegExp(`${token}\\s*:`));
			expect(dark).toContain(token);
		}
	});

	it('gives every category a --mep-cat-* token in both themes', () => {
		const block = (sel: RegExp) => css.match(sel)?.[0] ?? '';
		const light = block(/:root\[data-theme=["']light["']\]\s*{[\s\S]*?\n}/);
		const dark = block(/:root\[data-theme=["']dark["']\]\s*{[\s\S]*?\n}/);
		const missing: string[] = [];
		for (const cat of VALID_CATEGORIES) {
			const token = `--mep-cat-${categorySlug(cat)}`;
			if (!light.includes(token)) missing.push(`${token} (light)`);
			if (!dark.includes(token)) missing.push(`${token} (dark)`);
		}
		expect(missing).toEqual([]);
		expect(CATEGORY_COLORS['Other']).toBe('var(--mep-cat-other)');
	});

	it('resolves every category to a token, never a literal', () => {
		// categoryColor() feeds `background`, `color` and SVG fill/stroke alike;
		// a hex here would be a colour that cannot follow the theme.
		for (const cat of VALID_CATEGORIES) {
			expect(categoryColor(cat)).toMatch(/^var\(--mep-cat-[a-z0-9-]+\)$/);
		}
		// A blank/absent category is "uncategorised", not a custom one — it
		// still lands on the fixed Other token.
		for (const cat of ['', null, undefined]) {
			expect(categoryColor(cat)).toBe('var(--mep-cat-other)');
		}
		// A custom category (issue #881) has no --mep-cat-* token of its own —
		// it gets a deterministic --mep-series-* colour instead.
		for (const cat of ['Not A Category', 'Marketing']) {
			expect(categoryColor(cat)).toMatch(/^var\(--mep-series-\d\)$/);
		}
		// The tint replaced `background:{color}24`, which produced
		// `var(--mep-cat-bebidas)24` — not a colour — once the value became a token.
		expect(categoryTint('Bebidas')).toBe(
			'color-mix(in oklab, var(--mep-cat-bebidas) 14%, transparent)',
		);
	});

	it('gives a custom category a stable colour that differs from another custom category', () => {
		// issue #881 part 2 — two custom categories should not collide onto the
		// same swatch, and the same name always renders the same colour.
		expect(categoryColor('Marketing')).toBe(categoryColor('Marketing'));
		expect(categoryColor('Marketing')).not.toBe(categoryColor('Logística'));
	});

	it('keeps colour decisions out of the load functions', () => {
		// The load functions run on the server, which cannot know the theme: it
		// lives in localStorage and is stamped onto documentElement by
		// static/theme-init.js. Anything they colour is stuck on one ramp.
		// og.png (issue #329) is a server-rendered SVG share card, not a themed
		// page — there is no viewer session to read a theme from, and no CSS
		// custom properties resolve inside a standalone SVG document either.
		// It hand-copies the light --mep-neg/--mep-pos values, same carve-out
		// as email.ts (see design-tokens-accent-discipline.test.ts).
		const SANCTIONED = new Set(['src/routes/s/[token]/og.png/+server.ts']);

		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			if (!/\+(page|layout)\.server\.ts$|\+server\.ts$/.test(file)) continue;
			const rel = path.relative(ROOT, file).split(path.sep).join('/');
			if (SANCTIONED.has(rel)) continue;
			const src = readFileSync(file, 'utf8');
			// `color: { argb }` is an ExcelJS cell style in the .xlsx export —
			// a generated file, with no theme to follow. Only CSS-shaped values count.
			if (/\bcolors?\s*:(?!\s*\{)/.test(src) || /#[0-9a-fA-F]{6}\b/.test(src)) {
				offenders.push(rel);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("binds Tailwind's dark: variant to data-theme, not the OS preference", () => {
		// Tailwind 4 compiles `dark:` to @media (prefers-color-scheme: dark) by
		// default. MEP themes on data-theme, which theme-init.js reads from
		// localStorage and only falls back to the OS preference for — so the two
		// signals diverge the moment someone uses the theme toggle, and a `dark:`
		// utility would paint for the opposite theme from the tokens around it.
		const variant = css.match(/@custom-variant\s+dark\s*\(([^)]*)\)/);
		expect(variant, '@custom-variant dark is missing from app.css').not.toBeNull();
		expect(variant![1]).toContain('data-theme');
		expect(variant![1]).not.toContain('prefers-color-scheme');

		// The whole stylesheet themes on the attribute; nothing keys off the OS.
		// Comments stripped first — the block above this variant explains the
		// default it overrides, and naming it is not the same as using it.
		const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(rules).not.toContain('prefers-color-scheme');
	});

	it('keeps native dropdown popups readable in both themes', () => {
		// Two independent things have to hold, and each one alone looks fixed.
		//
		// `color-scheme` tells the browser which palette to draw native controls
		// with. Without it every <select> popup keeps the light-scheme text
		// colour, which is unreadable on a dark surface.
		expect(css).toMatch(/\[data-theme="light"\][^}]*color-scheme:\s*light/);
		expect(css).toMatch(/\[data-theme="dark"\][^}]*color-scheme:\s*dark/);

		// Chrome propagates the <select>'s own background to the <option>s in the
		// popup. The filter selects wear `.btn .btn-secondary`, whose :hover
		// background is the translucent --mep-hover, so without an explicit opaque
		// background here the popup faded to white 150ms after opening — the .btn
		// transition animating it. Deleting this rule is silent everywhere else.
		const option = css.match(/^\s*option\s*\{([^}]*)\}/m);
		expect(option, 'the bare `option` rule is missing from app.css').not.toBeNull();
		expect(option![1]).toContain('--mep-surface');
		expect(option![1]).toContain('--mep-fg');

		// Same propagation, the other half: Chrome paints the popup's own canvas
		// with the <select>'s background too, so a translucent one composites over
		// white. --mep-hover is rgba(255,255,255,.05) and .rev-cell is transparent,
		// which is why the popup washed out on hover. Every state a <select> can be
		// in has to resolve to an opaque colour.
		expect(css).toMatch(/select\.btn-secondary:hover\s*\{[^}]*--mep-surface-2/);
		expect(css).toMatch(/select\.rev-cell[^{]*\{[^}]*--mep-surface/);
	});

	it('never pairs a hard-coded #fff with a solid semantic fill', () => {
		// White is legible on the light semantic ramp but not the dark one
		// (#fff on --mep-warn is 2.6:1 there) — use the matching *-fg ink.
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			const src = readFileSync(file, 'utf8');
			const re = /var\(--mep-(pos|neg|warn|info|acc)\)\s*(?:;\s*)?color:\s*#(fff|ffffff)\b/gi;
			if (re.test(src)) offenders.push(path.relative(ROOT, file));
		}
		expect(offenders).toEqual([]);
	});
});
