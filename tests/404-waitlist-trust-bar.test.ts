/**
 * Issue #404 — waitlist: trust/support bar (response time, batch cadence).
 *
 * A compact 3-item trust bar sits right above the final CTA section, so the
 * reassurance is visible without a click instead of buried in the collapsed
 * FAQ accordion. Every claim it makes must already be substantiated
 * elsewhere on the page — this file proves the bar exists, sits in the
 * right place, is built entirely from `waitlist.trustBar.*` i18n keys (no
 * hardcoded prose), that those keys are defined and distinct in both
 * locales, and — the acceptance criterion that matters most — that each
 * bar item is a faithful, non-fabricated condensation of copy that already
 * appears elsewhere on the page:
 *
 *   - cadence -> waitlist.faq.4.a  (the "when does access start" FAQ answer,
 *     itself the #333 wording: batches, advance notice by email)
 *   - support -> waitlist.pricingFoot (the pricing-table footnote: human /
 *     Spanish-language support included on every plan)
 *   - privacy -> waitlist.faq.0.a  (the "what happens to my data" FAQ
 *     answer: encrypted, EU servers)
 *
 * No new unverified claims (no fabricated response times or satisfaction
 * percentages) are introduced — that is checked by requiring every word
 * the bar item asserts to also appear in its named source key.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations, type Locale } from '../src/lib/i18n-messages';

const ROOT = path.resolve(__dirname, '..');
const PAGE_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/LandingPage.svelte'), 'utf8');

const LOCALES: Locale[] = ['es', 'en'];

const TRUST_BAR_KEYS = [
	'waitlist.trustBarLabel',
	'waitlist.trustBar.cadence.label',
	'waitlist.trustBar.cadence.body',
	'waitlist.trustBar.support.label',
	'waitlist.trustBar.support.body',
	'waitlist.trustBar.privacy.label',
	'waitlist.trustBar.privacy.body',
];

function tr(loc: Locale, key: string): string {
	return (translations[loc] as Record<string, string>)[key];
}

import { assertSectionUsesTokens } from './helpers/extract-section';

describe('waitlist.trustBar* keys exist in both locales (issue #404)', () => {
	for (const key of TRUST_BAR_KEYS) {
		it(`defines ${key} in es and en, non-empty`, () => {
			for (const loc of LOCALES) {
				expect(tr(loc, key), `${loc}.${key}`).toBeTruthy();
			}
		});

		it(`${key} differs between es and en (real translation, not a copy-paste)`, () => {
			expect(tr('es', key)).not.toBe(tr('en', key));
		});
	}
});

describe('LandingPage.svelte renders the trust bar between the FAQ and the final CTA', () => {
	it('sits after waitlist.faqEyebrow and before waitlist.closeHead in source order', () => {
		const faqIdx = PAGE_SRC.indexOf("t('waitlist.faqEyebrow')");
		const trustIdx = PAGE_SRC.indexOf("aria-label={t('waitlist.trustBarLabel')}");
		const closeIdx = PAGE_SRC.indexOf("t('waitlist.closeHead')");
		expect(faqIdx, 'waitlist.faqEyebrow not found').toBeGreaterThan(-1);
		expect(trustIdx, 'trust bar aria-label not found').toBeGreaterThan(-1);
		expect(closeIdx, 'waitlist.closeHead not found').toBeGreaterThan(-1);
		expect(trustIdx).toBeGreaterThan(faqIdx);
		expect(trustIdx).toBeLessThan(closeIdx);
	});

	it('builds the three-item bar from a $derived array using the trustBar i18n keys via t', () => {
		const block = PAGE_SRC.match(/const trustBarItems = \$derived\(\[([\s\S]*?)\]\);/);
		expect(block, 'trustBarItems derived array not found').toBeTruthy();
		for (const item of ['cadence', 'support', 'privacy']) {
			expect(block![1]).toContain(`waitlist.trustBar.${item}.label`);
			expect(block![1]).toContain(`waitlist.trustBar.${item}.body`);
		}
	});

	it('renders exactly three trust-bar items (no 4th unsourced stat)', () => {
		const block = PAGE_SRC.match(/const trustBarItems = \$derived\(\[([\s\S]*?)\]\);/)![1];
		const count = (block.match(/\.label'\)/g) ?? []).length;
		expect(count).toBe(3);
	});

	it('uses design-system tokens for color and radius, not hex literals', () => {
		assertSectionUsesTokens(PAGE_SRC, "aria-label={t('waitlist.trustBarLabel')}", ['rounded-card', 'border-divider']);
	});

	it('marks the bar up as a list for assistive tech (role="list" / role="listitem")', () => {
		const startIdx = PAGE_SRC.indexOf("aria-label={t('waitlist.trustBarLabel')}");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', startIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', startIdx);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);
		expect(section).toContain('role="list"');
		expect(section).toContain('role="listitem"');
	});
});

describe('every trust-bar claim is already substantiated elsewhere on the page (acceptance criterion)', () => {
	const CADENCE_WORDS: Record<Locale, string[]> = {
		es: ['tandas', 'antelaci'],
		en: ['batches', 'advance'],
	};
	/**
	 * Re-anchored in GEO Phase 0. This pair used to pin the privacy claim to
	 * the FAQ's "cifrados en servidores de la UE" — but that was one of the
	 * unverified assertions the phase retracted (marketing rule 1), so the
	 * words it pinned no longer exist. The acceptance criterion itself is
	 * unchanged: the trust-bar claim must still be substantiated by the FAQ
	 * answer. It is now anchored on the export/delete guarantee, which is a
	 * real, shipped feature (see tests/account-export.test.ts,
	 * tests/account-delete.test.ts) rather than an infrastructure promise.
	 */
	const PRIVACY_WORDS: Record<Locale, string[]> = {
		es: ['export', 'elimin'],
		en: ['export', 'delete'],
	};

	it('cadence item reuses words from waitlist.faq.4.a (the batch-cadence FAQ answer)', () => {
		for (const loc of LOCALES) {
			const source = tr(loc, 'waitlist.faq.4.a').toLowerCase();
			const claim = (tr(loc, 'waitlist.trustBar.cadence.label') + ' ' + tr(loc, 'waitlist.trustBar.cadence.body')).toLowerCase();
			for (const word of CADENCE_WORDS[loc]) {
				expect(source, `${loc} faq.4.a should contain "${word}"`).toContain(word);
				expect(claim, `${loc} cadence claim should reuse "${word}" from faq.4.a`).toContain(word);
			}
		}
	});

	it('support item reuses the exact support phrase from waitlist.pricingFoot', () => {
		for (const loc of LOCALES) {
			const source = tr(loc, 'waitlist.pricingFoot').toLowerCase();
			const label = tr(loc, 'waitlist.trustBar.support.label').toLowerCase();
			expect(source, `${loc} pricingFoot should contain the support-bar label verbatim`).toContain(label);
		}
	});

	it('privacy item reuses words from waitlist.faq.0.a (the data-privacy FAQ answer)', () => {
		for (const loc of LOCALES) {
			const source = tr(loc, 'waitlist.faq.0.a').toLowerCase();
			const claim = (tr(loc, 'waitlist.trustBar.privacy.label') + ' ' + tr(loc, 'waitlist.trustBar.privacy.body')).toLowerCase();
			for (const word of PRIVACY_WORDS[loc]) {
				expect(source, `${loc} faq.0.a should mention "${word}"`).toContain(word);
				expect(claim, `${loc} privacy claim should reuse "${word}" from faq.0.a`).toContain(word);
			}
			expect(claim, `${loc} privacy claim must not re-assert unverified hosting`).not.toMatch(/cifrad|encrypt|\bue\b|\beu\b/);
		}
	});

	it('never introduces a fabricated satisfaction percentage or response-time number', () => {
		for (const loc of LOCALES) {
			for (const key of TRUST_BAR_KEYS) {
				expect(tr(loc, key), `${loc}.${key}`).not.toMatch(/%|\bmin(ute)?s?\b|\bhora|\bhour/i);
			}
		}
	});
});
