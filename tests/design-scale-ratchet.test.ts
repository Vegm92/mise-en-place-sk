/**
 * A ratchet on the type and radius scales.
 *
 * MEP defines six font sizes (11/13/16/20/24/32px, as .label/.body/.subtitle/
 * .title/.title-lg/.hero) and four radii. Inline styles have drifted well past
 * both: 35 distinct font sizes are in use, and 62% of inline font-size
 * declarations sit off the scale — 12px, 12.5px, 11.5px, 10.5px and so on.
 *
 * Snapping those ~750 declarations to the six-value scale is the right end
 * state, but it moves type by half a pixel to a pixel on every screen in the
 * app, so it wants a designer rather than a codemod. This test does the part
 * that needs no judgement: it holds the line. New code has to use the scale,
 * and the existing drift gets paid down whenever a file is touched anyway.
 *
 * When you reduce a count, lower the budget here in the same commit. That is
 * the ratchet: the numbers may go down, never up.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/** Lower these as the drift is paid down. Never raise them. */
const BUDGET = { fontSize: 600, borderRadius: 116 };

const TYPE_SCALE = new Set(['11px', '13px', '16px', '20px', '24px', '32px']);
const RADIUS_SCALE = new Set([
	'4px', '6px', '10px', '999px',
	'var(--mep-r-tag)', 'var(--mep-r-input)', 'var(--mep-r-card)', 'var(--mep-r-pill)',
]);

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (entry.endsWith('.svelte')) out.push(full);
	}
	return out;
}

type Offender = { file: string; value: string };

function inlineDeclarations(src: string): Array<{ key: string; value: string }> {
	const decls: Array<{ key: string; value: string }> = [];
	for (const attr of src.matchAll(/style="([^"]*)"/g)) {
		for (const decl of attr[1].split(';')) {
			const at = decl.indexOf(':');
			if (at < 0) continue;
			decls.push({ key: decl.slice(0, at).trim(), value: decl.slice(at + 1).trim() });
		}
	}
	return decls;
}

function offScale(prop: string, scale: Set<string>): Offender[] {
	const found: Offender[] = [];
	for (const file of walk(SRC)) {
		for (const { key, value } of inlineDeclarations(readFileSync(file, 'utf8'))) {
			// Interpolated values are computed at runtime — not a scale choice.
			if (key !== prop || value.includes('{')) continue;
			if (!scale.has(value)) found.push({ file: path.relative(ROOT, file), value });
		}
	}
	return found;
}

function summarise(offenders: Offender[], limit = 6): string {
	const byValue = new Map<string, number>();
	for (const o of offenders) byValue.set(o.value, (byValue.get(o.value) ?? 0) + 1);
	return [...byValue.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([v, n]) => `${v} ×${n}`)
		.join(', ');
}

describe('MEP scale ratchet', () => {
	it(`keeps off-scale inline font-size at or below ${BUDGET.fontSize}`, () => {
		const offenders = offScale('font-size', TYPE_SCALE);
		expect(
			offenders.length,
			`off-scale font sizes: ${summarise(offenders)}. ` +
				'Use the type scale (11/13/16/20/24/32px) or the .label/.body/.subtitle/' +
				'.title/.title-lg/.hero classes. If you removed some, lower BUDGET here.',
		).toBeLessThanOrEqual(BUDGET.fontSize);
	});

	it(`keeps off-scale inline border-radius at or below ${BUDGET.borderRadius}`, () => {
		const offenders = offScale('border-radius', RADIUS_SCALE);
		expect(
			offenders.length,
			`off-scale radii: ${summarise(offenders)}. ` +
				'Use --mep-r-tag / -input / -card / -pill. If you removed some, lower BUDGET here.',
		).toBeLessThanOrEqual(BUDGET.borderRadius);
	});

	it('has a budget that matches reality, so the ratchet can only tighten', () => {
		// If the real count drops below the budget the budget is stale: it would
		// silently allow drift back up to the old number.
		expect(offScale('font-size', TYPE_SCALE).length).toBe(BUDGET.fontSize);
		expect(offScale('border-radius', RADIUS_SCALE).length).toBe(BUDGET.borderRadius);
	});
});
