/**
 * Budgets mobile disclosure (issue #653).
 *
 * The mobile block of /budgets iterated the full `rows` list, so at 390px
 * every known category rendered a full-height card — 17 cards, most showing
 * 0,00 € and an empty "Sin límite" input — before the six categories that
 * actually carry a budget or spend. The fix splits the rows: categories with
 * a budget or non-zero spend (plus freshly added custom categories) render
 * by default, the rest live behind a "Mostrar todas las categorías (n)"
 * disclosure that keeps their inputs in the DOM (hidden, not removed) so a
 * budget typed there still submits after collapsing. The projection pill may
 * shrink and the category name carries min-width:0 so long names cannot push
 * the pill past the card edge. Desktop keeps iterating the full list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE = read('src/routes/(app)/budgets/+page.svelte');
const I18N = read('src/lib/i18n.ts');

const mobileBlock = () => {
	const at = PAGE.indexOf('md:hidden');
	expect(at, 'expected a mobile-only block').toBeGreaterThan(-1);
	return PAGE.slice(at);
};

describe('budgets mobile disclosure (issue #653)', () => {
	it('splits rows into active (budget or spend or custom) and inactive', () => {
		expect(PAGE).toMatch(/activeRows\s*=\s*\$derived/);
		expect(PAGE).toMatch(/inactiveRows\s*=\s*\$derived/);
		expect(PAGE).toMatch(/r\.limit\s*>\s*0\s*\|\|\s*r\.spent\s*>\s*0\s*\|\|\s*customCategories\.includes\(r\.cat\)/);
	});

	it('the mobile list iterates activeRows, not the full rows list', () => {
		const mobile = mobileBlock();
		expect(mobile).toMatch(/\{#each activeRows as r/);
		expect(mobile).not.toMatch(/\{#each rows as r\}/);
	});

	it('inactive categories sit behind a disclosure toggle with a count', () => {
		const mobile = mobileBlock();
		expect(mobile).toMatch(/aria-expanded=\{showAllCats\}/);
		expect(mobile).toMatch(/\$ti\('bud\.showAllCategories',\s*\{\s*n:\s*inactiveRows\.length\s*\}\)/);
		expect(mobile).toMatch(/\$t\('bud\.hideAllCategories'\)/);
		expect(mobile).toMatch(/\{#each inactiveRows as r/);
	});

	it('collapsed inactive cards stay in the DOM (hidden) so typed budgets still submit', () => {
		const mobile = mobileBlock();
		expect(mobile).toMatch(/style:display=\{showAllCats \? 'flex' : 'none'\}/);
	});

	it('the projection pill can shrink and the name has min-width:0', () => {
		const mobile = mobileBlock();
		const nameAt = mobile.indexOf('text-overflow:ellipsis');
		expect(nameAt).toBeGreaterThan(-1);
		expect(mobile.slice(0, mobile.indexOf('bud.closeShort'))).toMatch(/min-width:0/);
		const pillAt = mobile.indexOf('bud.closeShort');
		const pillStyle = mobile.slice(mobile.lastIndexOf('<span', pillAt), pillAt);
		expect(pillStyle).not.toMatch(/flex-shrink:0/);
	});

	it('the desktop table still iterates the full rows list', () => {
		const desktop = PAGE.slice(0, PAGE.indexOf('md:hidden'));
		expect(desktop).toMatch(/\{#each rows as r\}/);
	});

	it('i18n defines the disclosure keys in both locales', () => {
		const es = I18N.slice(I18N.indexOf('es: {'), I18N.indexOf('en: {'));
		const en = I18N.slice(I18N.indexOf('en: {'));
		for (const block of [es, en]) {
			expect(block).toMatch(/'bud\.showAllCategories':\s*'[^']*\{n\}[^']*'/);
			expect(block).toMatch(/'bud\.hideAllCategories':\s*'[^']+'/);
		}
	});
});
