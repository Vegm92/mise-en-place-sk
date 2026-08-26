/**
 * Issue #650 — /settings unusable at 390px.
 *
 * The page rendered its desktop shape (a ~186px section rail beside a content
 * column) at every viewport: below md the rail ate half the width and the
 * content column clipped its own inputs (overflow-x: clip on the email field).
 *
 * The fix follows the /suppliers/[id] split: the rail+column layout becomes a
 * desktop-only branch (`hidden md:flex`), and below md (`md:hidden`) the
 * sections render full-width. Section bodies are written once (a snippet) and
 * rendered by both branches, so the two can never drift.
 *
 * The later settings redesign replaced the mobile accordion with list + panel
 * navigation — one section at a time, with a way back — because an accordion
 * of dense forms buries the section you are in. What this file guards is the
 * issue's requirement, not the accordion: no desktop rail below md, one
 * source for the section bodies, touch-sized rows, and no scroll strip.
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

	it('renders a mobile branch (md:hidden) that pushes one section at a time', () => {
		expect(
			/class="[^"]*\bmd:hidden\b[^"]*"/.test(src),
			'a `md:hidden` mobile branch must exist',
		).toBe(true);
		expect(
			src.includes('set-mob-item'),
			'the mobile branch lists the sections as full-width rows',
		).toBe(true);
		expect(
			src.includes('set-mob-back'),
			'an opened mobile section must offer a way back to the list',
		).toBe(true);
	});

	it('keeps the desktop rail out of the mobile branch', () => {
		const mobileAt = src.search(/class="[^"]*\bmd:hidden\b[^"]*"/);
		expect(mobileAt).toBeGreaterThan(-1);
		const markup = src.slice(mobileAt, src.lastIndexOf('<style>'));
		expect(
			markup.includes('settings-rail'),
			'the 186px section rail is what made /settings unusable at 390px',
		).toBe(false);
	});

	it('gives every mobile row a touch-sized hit area', () => {
		const row = /\.set-mob-item\s*\{[^}]*min-height:\s*(\d+)px/.exec(src);
		expect(row, 'the mobile section rows must declare a min-height').not.toBeNull();
		expect(Number(row![1])).toBeGreaterThanOrEqual(44);
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
