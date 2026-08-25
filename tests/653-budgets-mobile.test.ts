import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE_PATH = path.resolve(__dirname, '../src/routes/(app)/budgets/+page.svelte');
const PAGE = readFileSync(PAGE_PATH, 'utf8');
const I18N_PATH = path.resolve(__dirname, '../src/lib/i18n.ts');
const I18N = readFileSync(I18N_PATH, 'utf8');

const DESKTOP_START = PAGE.indexOf('<div class="hidden md:flex"');
const MOBILE_START = PAGE.indexOf('<div class="flex md:hidden"');
const DESKTOP = PAGE.slice(DESKTOP_START, MOBILE_START);
const MOBILE = PAGE.slice(MOBILE_START);

describe('budgets mobile collapses zero-activity categories (issue #653)', () => {
	it('adds a showAllCats state flag', () => {
		expect(PAGE).toMatch(/let showAllCats = \$state\(false\)/);
	});

	it('derives activeRows and inactiveRows from budget/spend/custom-category status', () => {
		expect(PAGE).toMatch(
			/const activeRows = \$derived\(rows\.filter\(r => r\.limit > 0 \|\| r\.spent > 0 \|\| customCategories\.includes\(r\.cat\)\)\)/
		);
		expect(PAGE).toMatch(
			/const inactiveRows = \$derived\(rows\.filter\(r => !\(r\.limit > 0 \|\| r\.spent > 0 \|\| customCategories\.includes\(r\.cat\)\)\)\)/
		);
	});

	it('extracts the mobile card into a budgetCard snippet', () => {
		expect(MOBILE).toMatch(/\{#snippet budgetCard\(r[):]/);
		expect(MOBILE).toMatch(/\{#each activeRows as r/);
		expect(MOBILE).toMatch(/\{@render budgetCard\(r\)\}/);
	});

	it('hides inactive categories with display:none, not an {#if}, so their inputs still submit', () => {
		expect(MOBILE).toMatch(/style:display=\{showAllCats \? 'flex' : 'none'\}/);
		expect(MOBILE).not.toMatch(/\{#if showAllCats\}[\s\S]*inactiveRows/);
	});

	it('lets the projection pill shrink instead of clipping', () => {
		expect(MOBILE).toMatch(/font-size:11px;font-weight:500;padding:2px 7px;border-radius:4px;min-width:0;/);
		expect(MOBILE).toMatch(/flex:1;min-width:0;font-size:14px;font-weight:500;/);
	});

	it('leaves the desktop block byte-identical (no showAllCats/activeRows leakage)', () => {
		expect(DESKTOP).not.toMatch(/showAllCats/);
		expect(DESKTOP).not.toMatch(/activeRows/);
		expect(DESKTOP).toMatch(/\{#each rows as r\}/);
	});

	it('defines the disclosure i18n keys in both locales', () => {
		const esBlock = I18N.split("export const translations")[1]?.split('\n  en: {')[0] ?? '';
		const enBlock = I18N.split('\n  en: {')[1] ?? '';
		for (const block of [esBlock, enBlock]) {
			expect(block).toMatch(/'bud\.showAllCategories':\s*'[^']*\{n\}[^']*'/);
			expect(block).toMatch(/'bud\.hideAllCategories':\s*'[^']*'/);
		}
	});
});
