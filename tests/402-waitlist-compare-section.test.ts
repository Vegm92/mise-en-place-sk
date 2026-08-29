/**
 * Issue #402 — waitlist: "Sin vs Con Mise en Place" comparison section.
 *
 * The issue predates two refactors: the landing markup now lives in
 * `src/lib/components/landing/LandingPage.svelte` (issue #327, rendered on
 * /waitlist and every /l/[variant] page) and its copy comes from the shared
 * `waitlist.*` table in `src/lib/i18n.ts` (issue #407), not a page-local
 * `copy.es/copy.en` object. This file proves the new comparison section
 * exists, sits between the pain and how-it-works sections, is built
 * entirely from `waitlist.compare.*` i18n keys (no hardcoded prose), and
 * that those keys are defined — and distinct from each other — in both
 * locales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations, type Locale } from '../src/lib/i18n';

const ROOT = path.resolve(__dirname, '..');
const PAGE_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/LandingPage.svelte'), 'utf8');

const LOCALES: Locale[] = ['es', 'en'];

const COMPARE_KEYS = [
	'waitlist.compareEyebrow',
	'waitlist.compareHead',
	'waitlist.compare.without.title',
	'waitlist.compare.without.0',
	'waitlist.compare.without.1',
	'waitlist.compare.without.2',
	'waitlist.compare.without.3',
	'waitlist.compare.with.title',
	'waitlist.compare.with.0',
	'waitlist.compare.with.1',
	'waitlist.compare.with.2',
	'waitlist.compare.with.3',
];

describe('waitlist.compare.* keys exist in both locales (issue #402)', () => {
	for (const key of COMPARE_KEYS) {
		it(`defines ${key} in es and en, non-empty`, () => {
			for (const loc of LOCALES) {
				const value = (translations[loc] as Record<string, string>)[key];
				expect(value, `${loc}.${key}`).toBeTruthy();
			}
		});

		it(`${key} differs between es and en (real translation, not a copy-paste)`, () => {
			const es = (translations.es as Record<string, string>)[key];
			const en = (translations.en as Record<string, string>)[key];
			expect(es).not.toBe(en);
		});
	}
});

describe('LandingPage.svelte renders the comparison section between pain and how-it-works', () => {
	it('the section sits after waitlist.painHead and before waitlist.howEyebrow in source order', () => {
		const painIdx = PAGE_SRC.indexOf("$t('waitlist.painHead')");
		const compareIdx = PAGE_SRC.indexOf("$t('waitlist.compareHead')");
		const howIdx = PAGE_SRC.indexOf("$t('waitlist.howEyebrow')");
		expect(painIdx, 'waitlist.painHead not found').toBeGreaterThan(-1);
		expect(compareIdx, 'waitlist.compareHead not found').toBeGreaterThan(-1);
		expect(howIdx, 'waitlist.howEyebrow not found').toBeGreaterThan(-1);
		expect(compareIdx).toBeGreaterThan(painIdx);
		expect(compareIdx).toBeLessThan(howIdx);
	});

	it('renders every waitlist.compare.* key through $t (source-scan, no hardcoded copy)', () => {
		for (const key of COMPARE_KEYS) {
			expect(PAGE_SRC, key).toContain(`$t('${key}')`);
		}
	});

	it('builds the "without" and "with" item lists from the four indexed compare keys each', () => {
		const withoutBlock = PAGE_SRC.match(/const compareWithoutItems = \$derived\(\[([\s\S]*?)\]\);/);
		const withBlock = PAGE_SRC.match(/const compareWithItems = \$derived\(\[([\s\S]*?)\]\);/);
		expect(withoutBlock, 'compareWithoutItems derived array not found').toBeTruthy();
		expect(withBlock, 'compareWithItems derived array not found').toBeTruthy();
		for (let i = 0; i < 4; i++) {
			expect(withoutBlock![1]).toContain(`waitlist.compare.without.${i}`);
			expect(withBlock![1]).toContain(`waitlist.compare.with.${i}`);
		}
	});

	it('uses the established pos/neg design tokens, not new or hardcoded colors', () => {
		const compareIdx = PAGE_SRC.indexOf("$t('waitlist.compareEyebrow')");
		expect(compareIdx, 'waitlist.compareEyebrow not found').toBeGreaterThan(-1);
		const sectionStart = PAGE_SRC.lastIndexOf('<section', compareIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', compareIdx);
		expect(sectionStart).toBeGreaterThan(-1);
		expect(sectionEnd).toBeGreaterThan(-1);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);
		expect(section).toContain('var(--mep-neg)');
		expect(section).toContain('var(--mep-neg-soft)');
		expect(section).toContain('var(--mep-neg-fg)');
		expect(section).toContain('var(--mep-pos)');
		expect(section).toContain('var(--mep-pos-soft)');
		expect(section).toContain('var(--mep-pos-fg)');
		expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	});

	it('collapses to a single column on mobile via the shared .mep-compare-grid breakpoint rule', () => {
		expect(PAGE_SRC).toContain('mep-compare-grid');
		expect(PAGE_SRC).toMatch(/\.mep-compare-grid\s*\{\s*grid-template-columns:\s*1fr\s*!important;?\s*\}|mep-compare-grid[^{]*\{[^}]*grid-template-columns:\s*1fr\s*!important/);
	});
});
