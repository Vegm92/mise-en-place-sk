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
	for (const m of src.matchAll(/var\(\s*(--mep-[a-z0-9-]+)/g)) {
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
