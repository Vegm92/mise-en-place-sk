/**
 * Blue is for actions, warm is for severity — and nothing may blur the two.
 *
 * `--mep-acc` paints primary buttons, active nav and the actual-spend stroke;
 * `--mep-warn` / `--mep-caution` / `--mep-neg` paint things that are wrong.
 * The retired amber accent broke that: its `--mep-acc` was #8a530f light /
 * #d59854 dark, the same hue and lightness as `--mep-warn` (#a85300 /
 * #e8934a), so a "Ver planes" button and an overdue invoice rendered as the
 * same colour. It was removed; these tests stop it, or anything like it,
 * coming back.
 *
 * They also guard the other direction: the semantic ramp carries meaning, so
 * it must never be recycled as a categorical palette. `--mep-series-*` (via
 * `seriesColor`) and `--mep-cat-*` (via `categoryColor`) exist for that.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const APP_CSS = path.join(SRC, 'app.css');
const css = readFileSync(APP_CSS, 'utf8');
/** Declarations only. The tinta block's comment quotes the amber values it
 *  replaced, and prose explaining a banned colour is not the banned colour. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(svelte|ts|js)$/.test(entry)) out.push(full);
	}
	return out;
}

const sources = walk(SRC).map(file => ({
	rel: path.relative(ROOT, file),
	text: readFileSync(file, 'utf8'),
}));

function rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Hue in degrees, 0–360. Reds sit near 0/360, ambers 25–55, blues 200–230.
 *  Meaningless on a near-neutral colour — see ACHROMATIC below. */
function hue([r, g, b]: [number, number, number]): number {
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	if (delta === 0) return 0;
	const h =
		max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
	return (h * 60 + 360) % 360;
}

/** HSV saturation, 0–1. A near-black or near-white ink accent (tinta) has
 *  almost none — its "hue" is an artifact of 8-bit rounding, not a colour
 *  competing with the severity ramp. Real ramp colours (warn/neg/caution) sit
 *  at 0.6+; this threshold sits an order of magnitude below that. */
function saturation([r, g, b]: [number, number, number]): number {
	const max = Math.max(r, g, b);
	return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

const ACHROMATIC = 0.15;

/** Where the severity ramp lives: neg ≈ 0°, warn ≈ 30°, caution ≈ 50°. */
const SEVERITY_BAND = (hex: string) => {
	const c = rgb(hex);
	return saturation(c) >= ACHROMATIC && (hue(c) < 70 || hue(c) > 340);
};

/** Every `.mep[data-accent="x"] { … --mep-acc: #hex … }`, tagged by theme. */
const accentBlocks = [
	...cssCode.matchAll(
		/(:root\[data-theme="dark"\]\s+)?\.mep\[data-accent="([a-z]+)"\]\s*\{([^}]*)\}/g,
	),
]
	.map(m => ({
		name: m[2],
		theme: m[1] ? 'dark' : 'light',
		acc: m[3].match(/--mep-acc:\s*(#[0-9a-fA-F]{6})/)?.[1],
	}))
	.filter((b): b is { name: string; theme: string; acc: string } => Boolean(b.acc));

describe('accent discipline — blue acts, warm warns', () => {
	it('finds accent blocks to check', () => {
		expect(accentBlocks.length).toBeGreaterThan(0);
	});

	it('keeps every accent out of the severity hue band', () => {
		const warm = accentBlocks
			.filter(b => SEVERITY_BAND(b.acc))
			.map(b => `data-accent="${b.name}" → --mep-acc: ${b.acc} (${Math.round(hue(rgb(b.acc)))}°)`);
		expect(warm).toEqual([]);
	});

	it('has no amber accent block left to reach for', () => {
		expect(cssCode).not.toMatch(/\[data-accent="amber"\]/);
	});

	it('has no amber accent value anywhere in the tree', () => {
		// src/lib/server/email.ts carried #8a530f long after the app moved to
		// slate, so every transactional email was branded a colour the product
		// no longer used. Copies drift; the sweep is what catches them.
		const AMBER = ['#8a530f', '#d59854', '#7e4c0d', '#e0a665', '138,83,15', '213,152,84'];
		const offenders: string[] = [];
		for (const { rel, text } of [...sources, { rel: 'src/app.css', text: cssCode }]) {
			const lower = text.toLowerCase();
			for (const gone of AMBER) if (lower.includes(gone)) offenders.push(`${rel}: ${gone}`);
		}
		expect(offenders).toEqual([]);
	});

	it('keeps the email palette in step with the light tokens', () => {
		// Email clients do not resolve custom properties, so email.ts copies the
		// light ramp by hand. A copy that nobody checks is a copy that drifts.
		const email = readFileSync(path.join(SRC, 'lib/server/email.ts'), 'utf8');
		const tintaLight = accentBlocks.find(b => b.name === 'tinta' && b.theme === 'light');
		expect(tintaLight, 'app.css declares a light tinta accent').toBeDefined();
		expect(email).toContain(`const COLOR_ACCENT = '${tintaLight!.acc}';`);

		const lightVars = cssCode.match(/:root\[data-theme="light"\]\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
		const token = (name: string) => lightVars.match(new RegExp(`--mep-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
		for (const [constant, tokenName] of [
			['COLOR_BG', 'bg'],
			['COLOR_SURFACE', 'surface'],
			['COLOR_FG', 'fg'],
			['COLOR_FG2', 'fg-2'],
			['COLOR_FG3', 'fg-3'],
		] as const) {
			const value = token(tokenName);
			expect(value, `--mep-${tokenName} is declared for light`).toBeDefined();
			expect(email, `${constant} tracks --mep-${tokenName}`).toContain(
				`const ${constant} = '${value}';`,
			);
		}
	});

	it('only ever sets an accent that app.css declares', () => {
		const declared = new Set(accentBlocks.map(b => b.name));
		const unknown: string[] = [];
		for (const { rel, text } of sources) {
			for (const m of text.matchAll(/data-accent="([a-z]+)"/g)) {
				if (!declared.has(m[1])) unknown.push(`${rel}: data-accent="${m[1]}"`);
			}
		}
		expect(unknown).toEqual([]);
	});

	it('never recycles the semantic ramp as a categorical palette', () => {
		// `const CAT_COLORS = ['var(--mep-acc)', …, 'var(--mep-warn)']` painted the
		// fifth spend category amber and the fourth red — nothing was wrong with
		// either. Categorical work belongs to seriesColor() / categoryColor().
		const SEMANTIC = /--mep-(warn|caution|neg|pos)\b/;
		const offenders: string[] = [];
		for (const { rel, text } of sources) {
			if (rel.endsWith('app.css')) continue;
			const decls = text.matchAll(
				/(?:const|let)\s+([A-Za-z_0-9]*(?:COLORS|PALETTE|SERIES|CAT)[A-Za-z_0-9]*)\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g,
			);
			for (const m of decls) {
				if (SEMANTIC.test(m[2])) offenders.push(`${rel}: ${m[1]}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('never hard-codes an accent or severity value in a component', () => {
		const ramp = new Set(
			[...cssCode.matchAll(/--mep-(?:acc|acc-hover|warn|caution|neg|pos|info):\s*(#[0-9a-fA-F]{6})/g)]
				.map(m => m[1].toLowerCase()),
		);
		expect(ramp.size).toBeGreaterThan(0);

		// email.ts is the one sanctioned copy — email clients do not resolve
		// custom properties — and the test above pins it to the light tokens.
		const SANCTIONED = new Set(['src/lib/server/email.ts']);

		const offenders: string[] = [];
		for (const { rel, text } of sources) {
			if (SANCTIONED.has(rel.split(path.sep).join('/'))) continue;
			for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
				if (ramp.has(m[0].toLowerCase())) offenders.push(`${rel}: ${m[0]}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
