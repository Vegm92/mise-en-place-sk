/**
 * Regression test for issue #720: ADR-026's contrast table measures every
 * severity/accent token as a flat *fill* against `--mep-surface`, but each
 * one is also used as text sitting on top of its own `-soft` tint (active
 * nav rows, badges, `.rev-rail-btn.active`) — a different pair, because the
 * translucent tint composites onto the surface before the text sits on it.
 *
 * `--mep-acc-soft` under `data-accent="slate"` in dark was `rgba(111,143,196,
 * 0.16)`: `#6f8fc4` text on that composited tint (over `--mep-surface`
 * `#1b1b1d`) measured 4.18:1 — below the 4.5:1 AA floor — despite the flat
 * fill clearing it at 5.24:1. Fixed by lowering that alpha to `0.10`. This
 * test parses the literal token values out of app.css (not the ADR's prose
 * numbers, which can drift from the tokens) and pins the composited ratio so
 * the alpha can't creep back up unnoticed.
 *
 * It also asserts the on-tint AA floor for the rest of the severity ramp
 * (`--mep-neg`, `--mep-warn`, `--mep-caution`), added by issue #749: the same
 * method applied to `#720`'s untouched pairs found `--mep-neg` text on its
 * own tint failing in dark (4.16:1) and `--mep-caution` text on its own tint
 * failing in light (4.35:1). Fixed by lowering `--mep-neg-soft`'s dark alpha
 * to `0.12` and `--mep-caution-soft`'s light alpha to `0.11` — see the
 * amendment in ADR-026.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const css = readFileSync(path.join(ROOT, 'src/app.css'), 'utf8');

function srgbToLinear(c: number): number {
	const cs = c / 255;
	return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

type Rgb = [number, number, number];

function relLuminance([r, g, b]: Rgb): number {
	const [R, G, B] = [r, g, b].map(srgbToLinear);
	return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(a: Rgb, b: Rgb): number {
	const L1 = relLuminance(a);
	const L2 = relLuminance(b);
	const lighter = Math.max(L1, L2);
	const darker = Math.min(L1, L2);
	return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): Rgb {
	const n = parseInt(hex.replace('#', ''), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function compositeOver(fg: Rgb, alpha: number, bg: Rgb): Rgb {
	return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
}

/** Text painted in `hex` at full opacity, sitting on `hex` composited at
 *  `alpha` over `surfaceHex` — the "-soft tint carrying its own accent as
 *  text" pattern this app uses throughout (`.mep-acc` on `.mep-acc-soft`,
 *  badges, active nav). */
function onTintRatio(hex: string, alpha: number, surfaceHex: string): number {
	const fg = hexToRgb(hex);
	const composited = compositeOver(fg, alpha, hexToRgb(surfaceHex));
	return contrastRatio(fg, composited);
}

function fillRatio(hex: string, surfaceHex: string): number {
	return contrastRatio(hexToRgb(hex), hexToRgb(surfaceHex));
}

/** Extracts `--name: #rrggbb;` or `--name: rgba(r, g, b, a);` from a block of
 *  CSS text (already narrowed to one `{ … }` rule). */
function token(block: string, name: string): string {
	const hex = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
	if (hex) return hex[1];
	const rgba = block.match(
		new RegExp(`--${name}:\\s*rgba\\(\\s*[^)]+\\)`),
	);
	if (rgba) return rgba[0].replace(new RegExp(`--${name}:\\s*`), '');
	throw new Error(`token --${name} not found`);
}

function alphaOf(rgbaDecl: string): number {
	const m = rgbaDecl.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
	if (!m) throw new Error(`not an rgba() declaration: ${rgbaDecl}`);
	return Number(m[1]);
}

function ruleBody(selectorPattern: RegExp): string {
	const m = css.match(selectorPattern);
	if (!m) throw new Error(`selector not found: ${selectorPattern}`);
	return m[0];
}

const rootBlock = ruleBody(/:root\s*\{[\s\S]*?\n\}/);
const lightBlock = ruleBody(/:root\[data-theme="light"\]\s*\{[\s\S]*?\n\}/);
const darkBlock = ruleBody(/:root\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/);
const slateLightBlock = ruleBody(/\.mep\[data-accent="slate"\]\s*\{[\s\S]*?\n\}/);
const slateDarkBlock = ruleBody(
	/:root\[data-theme="dark"\]\s+\.mep\[data-accent="slate"\]\s*\{[\s\S]*?\n\}/,
);

const surfaceLight = token(lightBlock, 'mep-surface');
const surfaceDark = token(darkBlock, 'mep-surface');

describe('on-tint contrast — text painted in a semantic colour on its own -soft tint (#720)', () => {
	it('reads the surfaces this test computes against', () => {
		expect(surfaceLight).toBe('#ffffff');
		// Retoned with the rest of the dark ground by ADR-031 (#1b1b1d →
		// #1a1b21): a four-point shift on blue, which moves every ratio below
		// by less than 0.01. The AA floors and the pinned values still hold.
		expect(surfaceDark).toBe('#1a1b21');
	});

	it('slate accent text on its own -soft tint clears AA in both themes', () => {
		const accLight = token(slateLightBlock, 'mep-acc');
		const softLight = token(slateLightBlock, 'mep-acc-soft');
		const accDark = token(slateDarkBlock, 'mep-acc');
		const softDark = token(slateDarkBlock, 'mep-acc-soft');

		const ratioLight = onTintRatio(accLight, alphaOf(softLight), surfaceLight);
		const ratioDark = onTintRatio(accDark, alphaOf(softDark), surfaceDark);

		expect(ratioLight).toBeCloseTo(6.98, 1);
		expect(ratioDark).toBeCloseTo(4.58, 1);
		expect(ratioLight).toBeGreaterThanOrEqual(4.5);
		expect(ratioDark).toBeGreaterThanOrEqual(4.5);
	});

	it('pins the fixed dark alpha so it cannot creep back toward the failing value', () => {
		const softDark = token(slateDarkBlock, 'mep-acc-soft');
		expect(alphaOf(softDark)).toBeLessThanOrEqual(0.11);

		const accDark = token(slateDarkBlock, 'mep-acc');
		const failingRatio = onTintRatio(accDark, 0.16, surfaceDark);
		expect(failingRatio).toBeLessThan(4.5);
	});

	it('keeps the slate tint perceptible, not just AA-legal', () => {
		const accDark = token(slateDarkBlock, 'mep-acc');
		const softDark = token(slateDarkBlock, 'mep-acc-soft');
		const alpha = alphaOf(softDark);
		const composited = compositeOver(hexToRgb(accDark), alpha, hexToRgb(surfaceDark));
		const visibility = contrastRatio(composited, hexToRgb(surfaceDark));
		expect(visibility).toBeGreaterThan(1.05);
	});

	it('every severity rung clears AA as text on its own -soft tint, in both themes (#749)', () => {
		const rungs: Array<{ name: string; light: number; dark: number }> = [];

		for (const name of ['mep-neg', 'mep-warn', 'mep-caution']) {
			const light = onTintRatio(
				token(rootBlock, name),
				alphaOf(token(rootBlock, `${name}-soft`)),
				surfaceLight,
			);
			const dark = onTintRatio(
				token(darkBlock, name),
				alphaOf(token(darkBlock, `${name}-soft`)),
				surfaceDark,
			);
			rungs.push({ name, light, dark });
			expect(light, `${name} on-tint, light`).toBeGreaterThanOrEqual(4.5);
			expect(dark, `${name} on-tint, dark`).toBeGreaterThanOrEqual(4.5);
		}

		const neg = rungs.find((r) => r.name === 'mep-neg')!;
		const warn = rungs.find((r) => r.name === 'mep-warn')!;
		const caution = rungs.find((r) => r.name === 'mep-caution')!;

		expect(neg.light).toBeCloseTo(4.99, 1);
		expect(neg.dark).toBeCloseTo(4.57, 1);
		expect(warn.light).toBeCloseTo(4.55, 1);
		expect(warn.dark).toBeCloseTo(5.19, 1);
		expect(caution.light).toBeCloseTo(4.53, 1);
		expect(caution.dark).toBeCloseTo(6.78, 1);
	});

	it('pins the fixed neg-dark and caution-light alphas so they cannot creep back toward the failing values', () => {
		const negSoftDark = token(darkBlock, 'mep-neg-soft');
		expect(alphaOf(negSoftDark)).toBeLessThanOrEqual(0.13);
		const negDark = token(darkBlock, 'mep-neg');
		const failingNegDark = onTintRatio(negDark, 0.18, surfaceDark);
		expect(failingNegDark).toBeLessThan(4.5);

		const cautionSoftLight = token(rootBlock, 'mep-caution-soft');
		expect(alphaOf(cautionSoftLight)).toBeLessThanOrEqual(0.12);
		const cautionLight = token(rootBlock, 'mep-caution');
		const failingCautionLight = onTintRatio(cautionLight, 0.14, surfaceLight);
		expect(failingCautionLight).toBeLessThan(4.5);
	});

	it('keeps the fixed severity tints perceptible, not just AA-legal', () => {
		const negDark = token(darkBlock, 'mep-neg');
		const negAlphaDark = alphaOf(token(darkBlock, 'mep-neg-soft'));
		const negVisibilityDark = contrastRatio(
			compositeOver(hexToRgb(negDark), negAlphaDark, hexToRgb(surfaceDark)),
			hexToRgb(surfaceDark),
		);
		expect(negVisibilityDark).toBeGreaterThan(1.14);

		const cautionLight = token(rootBlock, 'mep-caution');
		const cautionAlphaLight = alphaOf(token(rootBlock, 'mep-caution-soft'));
		const cautionVisibilityLight = contrastRatio(
			compositeOver(hexToRgb(cautionLight), cautionAlphaLight, hexToRgb(surfaceLight)),
			hexToRgb(surfaceLight),
		);
		expect(cautionVisibilityLight).toBeGreaterThan(1.14);
	});

	it('reproduces ADR-026 published fill ratios against the surface values in force when it was written', () => {
		const adrSurfaceDark = '#1e1d23';
		expect(fillRatio('#b03a3a', surfaceLight)).toBeCloseTo(5.98, 1);
		expect(fillRatio('#e16b6b', adrSurfaceDark)).toBeCloseTo(5.19, 1);
		expect(fillRatio('#a85300', surfaceLight)).toBeCloseTo(5.38, 1);
		expect(fillRatio('#e8934a', adrSurfaceDark)).toBeCloseTo(6.93, 1);
		expect(fillRatio('#34507a', surfaceLight)).toBeCloseTo(8.16, 1);
		expect(fillRatio('#6f8fc4', adrSurfaceDark)).toBeCloseTo(5.1, 1);
	});
});

/**
 * Regression test for issue #719: the account menu's language row painted
 * the target-locale hint ("EN"/"ES") in `--mep-fg-4` at 11px. On
 * `--mep-surface` in dark that measured below the 4.5:1 AA floor for text
 * this size — `--mep-fg-4` is the "de-emphasized, may not clear AA at small
 * sizes" rung, not a body-text colour. Fixed by moving the hint to
 * `--mep-fg-3`, the same rung #715 moved the rail's small text to (section
 * headings, locked labels, switcher label, plan-card separator). This test
 * pins `--mep-fg-3` on `--mep-surface` above 4.5:1 in both themes using the
 * literal token values (not prose numbers, which drift — see the dark
 * `--mep-surface` amendment in ADR-026) and confirms `--mep-fg-4` still
 * fails dark today, so the regression the fix addressed stays reproducible.
 */
describe('fg-3 vs fg-4 on --mep-surface — account-menu locale hint (#719)', () => {
	it('fg-3 on surface clears the 4.5:1 AA floor in both themes', () => {
		const fg3Light = token(lightBlock, 'mep-fg-3');
		const fg3Dark = token(darkBlock, 'mep-fg-3');

		const ratioLight = fillRatio(fg3Light, surfaceLight);
		const ratioDark = fillRatio(fg3Dark, surfaceDark);

		expect(ratioLight).toBeGreaterThanOrEqual(4.5);
		expect(ratioDark).toBeGreaterThanOrEqual(4.5);
	});

	it('fg-4 on surface still falls short in dark, confirming the bug fg-3 was moved to fix', () => {
		const fg4Dark = token(darkBlock, 'mep-fg-4');
		const ratioDark = fillRatio(fg4Dark, surfaceDark);
		expect(ratioDark).toBeLessThan(4.5);
	});

	it('the account-menu locale hint does not use --mep-fg-4', () => {
		const layoutPath = path.join(ROOT, 'src/routes/(app)/+layout.svelte');
		const layout = readFileSync(layoutPath, 'utf8');
		const menuStart = layout.indexOf('class="acct-menu"');
		const lastMenuItem = layout.indexOf("action.logout", menuStart);
		const menuEnd = layout.indexOf('{/if}', lastMenuItem);
		expect(menuStart).toBeGreaterThan(-1);
		expect(menuEnd).toBeGreaterThan(menuStart);

		const acctMenuMarkup = layout.slice(menuStart, menuEnd);
		expect(acctMenuMarkup).not.toContain('mep-fg-4');
		expect(acctMenuMarkup).toContain("locale === 'es' ? 'EN' : 'ES'");
		expect(acctMenuMarkup).toContain('mep-fg-3');
	});
});
