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
 * It also documents (without asserting AA on) two on-tint pairs discovered
 * by the same method that #720 did not fix: `--mep-neg` text on its own tint
 * in dark, and `--mep-caution` text on its own tint in light. Both are the
 * severity ramp, a different blast radius than the accent fix — see the
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
		expect(surfaceDark).toBe('#1b1b1d');
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

	it('documents the on-tint pairs #720 found but did not fix (severity ramp, out of scope)', () => {
		const negDark = token(darkBlock, 'mep-neg');
		const negSoftDark = token(darkBlock, 'mep-neg-soft');
		const negOnTintDark = onTintRatio(negDark, alphaOf(negSoftDark), surfaceDark);
		expect(negOnTintDark).toBeCloseTo(4.16, 1);
		expect(negOnTintDark).toBeLessThan(4.5);

		const cautionLight = token(rootBlock, 'mep-caution');
		const cautionSoftLight = token(rootBlock, 'mep-caution-soft');
		const cautionOnTintLight = onTintRatio(cautionLight, alphaOf(cautionSoftLight), surfaceLight);
		expect(cautionOnTintLight).toBeCloseTo(4.35, 1);
		expect(cautionOnTintLight).toBeLessThan(4.5);
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
