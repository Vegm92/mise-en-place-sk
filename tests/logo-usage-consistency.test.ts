/**
 * Issue #571 — the app carried ten hand-copied instances of the same
 * three-bar mark (sidebar, login, signup, onboarding, the error page, the
 * waitlist page twice, the admin shell, `AuthShell`) plus two logo *artworks*
 * that had silently drifted off the ink/parchment brand pair (ADR-028):
 * `static/favicon.svg` was still on a pre-ADR-026 amber (`#B8741A`), and
 * `scripts/generate-pwa-icons.mjs` drew an unrelated "M" letterform in forest
 * green — the exact gap ADR-028 flagged as "Not handled" and deferred.
 *
 * The fix: `src/lib/components/mep/Logo.svelte` is now the one in-app copy
 * (theme-aware via `currentColor` + `--mep-acc`, per ADR-028 — no separate
 * "inverted" asset needed). `src/lib/server/email.ts`'s `LOGO_SVG` is the one
 * sanctioned second copy — email clients cannot resolve Svelte components or
 * CSS custom properties, so it is a fixed dark-mark-on-white literal, the
 * same shape as `accent-discipline`'s email exception. The favicon and PWA
 * icon art move to the same mark, the same ink/parchment pair, matching
 * `manifest.webmanifest`'s own declared `theme_color` / `background_color`.
 *
 * This scan pins all of that so it cannot drift back to ten copies, or off
 * the brand pair, a third time.
 *
 * ADR-033 later replaced the three-bar artwork with the descending-shoulder
 * m monogram (a round-capped stroke path). The invariants are unchanged —
 * one in-app copy, one sanctioned email copy with identical geometry, icon
 * artwork on the manifest's ink/parchment pair — only the fingerprint and
 * the geometry extraction moved from `<rect>` bars to the mark's path data.
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
		else if (/\.(svelte|ts)$/.test(entry)) out.push(full);
	}
	return out;
}

const sources = walk(SRC).map(file => ({
	rel: path.relative(ROOT, file).split(path.sep).join('/'),
	text: readFileSync(file, 'utf8'),
}));

const LOGO_COMPONENT = 'src/lib/components/mep/Logo.svelte';
const EMAIL_FILE = 'src/lib/server/email.ts';

/** Fingerprint of the mark's opening stem and first shoulder — specific
 *  enough that nothing else in the tree could coincidentally match it. */
const MARK_FINGERPRINT = /M4\.4 18\.5 V9\.5 Q4\.4 5\.5 8\.2 5\.5/;

/** Pulls every copy of the mark's path data from a snippet — works for both
 *  Logo.svelte's quoted string constant and email.ts's `d="..."` literal. */
function extractMarkPaths(text: string): string[] {
	return [...text.matchAll(/(M4\.4 18\.5[^"'`]+)/g)].map(m => m[1]!.trim());
}

describe('logo usage consistency (issue #571)', () => {
	it('Logo.svelte exists and is theme-aware (currentColor + --mep-acc)', () => {
		const logo = sources.find(s => s.rel === LOGO_COMPONENT);
		expect(logo, `${LOGO_COMPONENT} should exist`).toBeDefined();
		expect(logo!.text).toMatch(/stroke="currentColor"/);
		expect(logo!.text).toContain('color: var(--mep-acc)');
	});

	it('no inline copy of the mark exists outside Logo.svelte and the sanctioned email.ts copy', () => {
		const offenders = sources
			.filter(s => s.rel !== LOGO_COMPONENT && s.rel !== EMAIL_FILE)
			.filter(s => MARK_FINGERPRINT.test(s.text))
			.map(s => s.rel);
		expect(offenders).toEqual([]);
	});

	it('every route/component using the mark imports it from Logo.svelte', () => {
		const usages = sources.filter(s => /<Logo\b/.test(s.text));
		expect(usages.length).toBeGreaterThanOrEqual(9);
		for (const { rel, text } of usages) {
			expect(text, `${rel} uses <Logo> but does not import it`).toMatch(
				/import Logo from ['"]\$lib\/components\/mep\/Logo\.svelte['"]/,
			);
		}
	});

	it('keeps the sanctioned email.ts mark geometry identical to Logo.svelte', () => {
		const logo = sources.find(s => s.rel === LOGO_COMPONENT)!;
		const email = sources.find(s => s.rel === EMAIL_FILE)!;
		const logoPaths = extractMarkPaths(logo.text);
		const emailPaths = extractMarkPaths(email.text);
		expect(logoPaths.length).toBeGreaterThanOrEqual(1);
		expect(emailPaths).toHaveLength(1);
		for (const p of [...logoPaths, ...emailPaths]) expect(p).toBe(logoPaths[0]);
	});

	it('favicon.svg carries no retired amber value', () => {
		const favicon = readFileSync(path.join(ROOT, 'static/favicon.svg'), 'utf8');
		expect(favicon.toUpperCase()).not.toContain('#B8741A');
	});

	it('favicon.svg uses the manifest ink/parchment pair', () => {
		const favicon = readFileSync(path.join(ROOT, 'static/favicon.svg'), 'utf8').toUpperCase();
		const manifest = JSON.parse(
			readFileSync(path.join(ROOT, 'static/manifest.webmanifest'), 'utf8'),
		);
		expect(favicon).toContain(String(manifest.theme_color).toUpperCase());
		expect(favicon).toContain(String(manifest.background_color).toUpperCase());
	});

	it('the PWA icon generator draws the manifest ink/parchment pair, not orphaned brand colours', () => {
		const script = readFileSync(
			path.join(ROOT, 'scripts/generate-pwa-icons.mjs'),
			'utf8',
		).toUpperCase();
		const manifest = JSON.parse(
			readFileSync(path.join(ROOT, 'static/manifest.webmanifest'), 'utf8'),
		);
		expect(script).toContain(String(manifest.theme_color).toUpperCase());
		expect(script).toContain(String(manifest.background_color).toUpperCase());
		expect(script).not.toContain('#1C3B2A');
		expect(script).not.toContain('#F0E6D3');
	});
});
