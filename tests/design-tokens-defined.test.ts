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
		if (!referencedIn.has(m[1])) referencedIn.set(m[1], new Set());
		referencedIn.get(m[1])!.add(rel);
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
		for (const cat of [...VALID_CATEGORIES, 'Not A Category', '', null, undefined]) {
			expect(categoryColor(cat)).toMatch(/^var\(--mep-cat-[a-z0-9-]+\)$/);
		}
		// The tint replaced `background:{color}24`, which produced
		// `var(--mep-cat-bebidas)24` — not a colour — once the value became a token.
		expect(categoryTint('Bebidas')).toBe(
			'color-mix(in oklab, var(--mep-cat-bebidas) 14%, transparent)',
		);
	});

	it('keeps colour decisions out of the load functions', () => {
		// The load functions run on the server, which cannot know the theme: it
		// lives in localStorage and is stamped onto documentElement by
		// static/theme-init.js. Anything they colour is stuck on one ramp.
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			if (!/\+(page|layout)\.server\.ts$|\+server\.ts$/.test(file)) continue;
			const src = readFileSync(file, 'utf8');
			// `color: { argb }` is an ExcelJS cell style in the .xlsx export —
			// a generated file, with no theme to follow. Only CSS-shaped values count.
			if (/\bcolors?\s*:(?!\s*\{)/.test(src) || /#[0-9a-fA-F]{6}\b/.test(src)) {
				offenders.push(path.relative(ROOT, file));
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

	it('never pairs a hard-coded #fff with a solid semantic fill', () => {
		// White is legible on the light semantic ramp but not the dark one
		// (#fff on --mep-warn is 2.6:1 there) — use the matching *-fg ink.
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			const src = readFileSync(file, 'utf8');
			const re = /var\(--mep-(pos|neg|warn|info|acc)\)\s*;?\s*color:\s*#(fff|ffffff)\b/gi;
			if (re.test(src)) offenders.push(path.relative(ROOT, file));
		}
		expect(offenders).toEqual([]);
	});
});
