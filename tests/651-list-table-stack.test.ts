/**
 * Stacked list tables (issue #651).
 *
 * ListPageTemplate renders its table snippet into a card that clips rather
 * than scrolls, so at 390px the /products and /plantilla-lista tables lose
 * whole columns. Below md a table is the wrong primitive: the pages opt in
 * to a shared `.tbl-stack` modifier (modeled on the frozen `.rev-tax-tbl`
 * pattern) that hides the header row and reflows each row as a stacked
 * block, with `data-label` keeping bare numeric values readable.
 *
 * Strictly opt-in: /invoices and /suppliers render the same template and
 * must not pick up the treatment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const APP_CSS = read('src/app.css');
const PRODUCTS = read('src/routes/(app)/products/+page.svelte');
const PLANTILLA = read('src/routes/(app)/plantilla-lista/+page.svelte');
const INVOICES = read('src/routes/(app)/invoices/+page.svelte');
const SUPPLIERS = read('src/routes/(app)/suppliers/+page.svelte');
const TEMPLATE = read('src/lib/components/mep/ListPageTemplate.svelte');

function mediaBlockContaining(css: string, selector: string): string {
	const at = css.indexOf(selector);
	expect(at, `expected app.css to define ${selector}`).toBeGreaterThan(-1);
	const before = css.slice(0, at);
	const mediaAt = before.lastIndexOf('@media');
	expect(mediaAt, `${selector} must live inside a media query`).toBeGreaterThan(-1);
	return before.slice(mediaAt, before.indexOf('{', mediaAt));
}

describe('stacked list tables (issue #651)', () => {
	it('app.css defines .tbl-stack under a mobile max-width media query', () => {
		const media = mediaBlockContaining(APP_CSS, '.tbl-stack thead');
		expect(media).toMatch(/max-width:\s*767px/);
	});

	it('the stack hides the header row and reflows rows as blocks', () => {
		const at = APP_CSS.indexOf('.tbl-stack thead');
		const block = APP_CSS.slice(at, at + 1600);
		expect(block).toMatch(/\.tbl-stack thead\s*\{\s*display:\s*none/);
		expect(block).toMatch(/display:\s*block/);
		expect(block).toMatch(/\.tbl-stack td\[data-label\]::before\s*\{\s*content:\s*attr\(data-label\)/);
	});

	it('products and plantilla-lista opt their tables in', () => {
		expect(PRODUCTS).toMatch(/class="tbl tbl-stack"/);
		expect(PLANTILLA).toMatch(/class="tbl tbl-stack"/);
	});

	it('bare numeric columns carry data-label so values survive losing the header', () => {
		expect(PRODUCTS).toMatch(/data-label=\{t\('prod\.col\.suppliers'\)\}/);
		expect(PRODUCTS).toMatch(/data-label=\{t\('prod\.col\.aliases'\)\}/);
		expect(PLANTILLA).toMatch(/data-label=\{t\('tpl\.demo\.col\.spend'\)\}/);
	});

	it('stays opt-in: invoices, suppliers, and the template itself are untouched', () => {
		expect(INVOICES).not.toContain('tbl-stack');
		expect(SUPPLIERS).not.toContain('tbl-stack');
		expect(TEMPLATE).not.toContain('tbl-stack');
	});

	it('adds no horizontal scroller: the stack never sets overflow-x', () => {
		const at = APP_CSS.indexOf('.tbl-stack');
		expect(at).toBeGreaterThan(-1);
		const section = APP_CSS.slice(at);
		expect(section).not.toMatch(/\.tbl-stack[^}]*overflow-x/);
	});
});
