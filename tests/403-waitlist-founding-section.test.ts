/**
 * Issue #403 — waitlist: founders/early-adopter incentive section.
 *
 * A short 3-step section (join the waitlist / private beta / launch with a
 * frozen founder price) sits between the pricing table and the FAQ, tying
 * directly into the existing `billing.provisional` / `waitlist.faq.3.a`
 * "prices are provisional" messaging: it explains *why* the pricing table
 * above is provisional and what early signers lock in. This file proves the
 * section exists, sits in the right place, is built entirely from
 * `waitlist.founding.*` / `waitlist.foundingEyebrow` / `waitlist.foundingHead`
 * / `waitlist.foundingSub` i18n keys (no hardcoded prose, no hardcoded price
 * literals), and that those keys are defined — and distinct from each other —
 * in both locales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations, type Locale } from '../src/lib/i18n-messages';

const ROOT = path.resolve(__dirname, '..');
const PAGE_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/LandingPage.svelte'), 'utf8');

const LOCALES: Locale[] = ['es', 'en'];

const FOUNDING_KEYS = [
	'waitlist.foundingEyebrow',
	'waitlist.foundingHead',
	'waitlist.foundingSub',
	'waitlist.founding.0.title',
	'waitlist.founding.0.body',
	'waitlist.founding.1.title',
	'waitlist.founding.1.body',
	'waitlist.founding.2.title',
	'waitlist.founding.2.body',
];

const BARE_PRICE = /\b(29|59|129)\b/;

describe('waitlist.founding* keys exist in both locales (issue #403)', () => {
	for (const key of FOUNDING_KEYS) {
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

		it(`${key} carries no hardcoded price literal`, () => {
			for (const loc of LOCALES) {
				const value = (translations[loc] as Record<string, string>)[key];
				expect(value).not.toMatch(BARE_PRICE);
			}
		});
	}
});

describe('LandingPage.svelte renders the founding section between pricing and FAQ', () => {
	it('the section sits after waitlist.pricingFoot and before waitlist.faqEyebrow in source order', () => {
		const pricingIdx = PAGE_SRC.indexOf("$t('waitlist.pricingFoot')");
		const foundingIdx = PAGE_SRC.indexOf("$t('waitlist.foundingHead')");
		const faqIdx = PAGE_SRC.indexOf("$t('waitlist.faqEyebrow')");
		expect(pricingIdx, 'waitlist.pricingFoot not found').toBeGreaterThan(-1);
		expect(foundingIdx, 'waitlist.foundingHead not found').toBeGreaterThan(-1);
		expect(faqIdx, 'waitlist.faqEyebrow not found').toBeGreaterThan(-1);
		expect(foundingIdx).toBeGreaterThan(pricingIdx);
		expect(foundingIdx).toBeLessThan(faqIdx);
	});

	it('renders the eyebrow/head/sub keys through $t (source-scan, no hardcoded copy)', () => {
		for (const key of ['waitlist.foundingEyebrow', 'waitlist.foundingHead', 'waitlist.foundingSub']) {
			expect(PAGE_SRC, key).toContain(`$t('${key}')`);
		}
	});

	it('builds the three-item list from the three indexed founding keys via $t, in a $derived array', () => {
		const block = PAGE_SRC.match(/const foundingItems = \$derived\(\[([\s\S]*?)\]\);/);
		expect(block, 'foundingItems derived array not found').toBeTruthy();
		for (let i = 0; i < 3; i++) {
			expect(block![1]).toContain(`waitlist.founding.${i}.title`);
			expect(block![1]).toContain(`waitlist.founding.${i}.body`);
		}
	});

	it('never hardcodes a PROVISIONAL_PRICE literal (29/59/129) inside the founding section', () => {
		const startIdx = PAGE_SRC.indexOf("$t('waitlist.foundingEyebrow')");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', startIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', startIdx);
		expect(sectionStart).toBeGreaterThan(-1);
		expect(sectionEnd).toBeGreaterThan(-1);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);
		expect(section).not.toMatch(BARE_PRICE);
	});

	it('uses design-system tokens for color and radius, not hex literals', () => {
		const startIdx = PAGE_SRC.indexOf("$t('waitlist.foundingEyebrow')");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', startIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', startIdx);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);
		expect(section).toContain('var(--mep-acc)');
		expect(section).toContain('var(--mep-r-card)');
		expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	});

	it('reuses the shared .mep-grid-3 class, which already collapses to one column on mobile', () => {
		const startIdx = PAGE_SRC.indexOf("$t('waitlist.foundingEyebrow')");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', startIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', startIdx);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);
		expect(section).toContain('mep-grid-3');
		expect(PAGE_SRC).toMatch(/\.mep-grid-3[^{]*\{[^}]*grid-template-columns:\s*1fr\s*!important/);
	});
});
