/**
 * Issue #650 — /settings unusable at 390px.
 *
 * The page rendered its desktop shape (a ~186px section rail beside a content
 * column) at every viewport: below md the rail ate half the width and the
 * content column clipped its own inputs (overflow-x: clip on the email field).
 *
 * The fix follows the /suppliers/[id] split: the rail+column layout becomes a
 * desktop-only branch (`hidden md:flex`), and below md (`md:hidden`) the
 * sections render as an accordion of full-width collapsible cards. Section
 * bodies are written once (a snippet) and rendered by both branches, so the
 * two can never drift.
 *
 * The measured half of this issue is `scripts/mobile-audit.mjs` against a
 * running dev server; what is checkable without a browser is the structure.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE = path.resolve(
	__dirname,
	'..',
	'src',
	'routes',
	'(app)',
	'settings',
	'+page.svelte',
);
const src = readFileSync(PAGE, 'utf8');

describe('settings mobile layout (issue #650)', () => {
	it('confines the section rail to a desktop-only (hidden md:flex) branch', () => {
		const railAt = src.indexOf('settings-rail');
		expect(railAt, 'desktop keeps its settings-rail').toBeGreaterThan(-1);
		const desktopWrapAt = src.search(/class="[^"]*\bhidden md:flex\b[^"]*"/);
		expect(
			desktopWrapAt,
			'the rail+column layout must sit inside a `hidden md:flex` wrapper',
		).toBeGreaterThan(-1);
		expect(
			desktopWrapAt,
			'the `hidden md:flex` wrapper must open before the rail renders',
		).toBeLessThan(railAt);
	});

	it('renders a mobile accordion branch (md:hidden) with per-section toggles', () => {
		expect(
			/class="[^"]*\bmd:hidden\b[^"]*"/.test(src),
			'a `md:hidden` mobile branch must exist',
		).toBe(true);
		expect(
			src.includes('aria-expanded'),
			'accordion section headers must expose aria-expanded',
		).toBe(true);
		expect(
			src.includes('set-acc-head'),
			'accordion header buttons carry the set-acc-head class',
		).toBe(true);
	});

	it('writes each section body once and renders it in both branches', () => {
		expect(
			src.includes('{#snippet sectionBody('),
			'section bodies live in a single sectionBody snippet',
		).toBe(true);
		const renders = src.match(/\{@render sectionBody\(/g) ?? [];
		expect(
			renders.length,
			'both the desktop column and the mobile accordion render sectionBody',
		).toBeGreaterThanOrEqual(2);
	});

	it('introduces no horizontal scroll strip', () => {
		expect(/overflow-x\s*:\s*(auto|scroll)/.test(src)).toBe(false);
		expect(src.includes('ScrollStrip')).toBe(false);
	});
});
