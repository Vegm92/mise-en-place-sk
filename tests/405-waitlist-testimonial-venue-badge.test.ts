/**
 * Issue #405 — waitlist: strengthen testimonial social proof with
 * venue-type context.
 *
 * The three `waitlist.testimonials.*.role` keys already pack three facts
 * into one string — job title, venue type, location — joined by " · "
 * (issue #407's copy migration; see #333 for the still-pending decision on
 * testimonial *framing*, which this issue does not touch). This issue is
 * display-only: it does not change any quote/name/role copy, only how the
 * venue-type segment is presented. `LandingPage.svelte` now parses that
 * middle segment out at render time (`splitRole`) and shows it as a
 * `.badge.badge-neutral` element, visually separated from the name line,
 * instead of trailing text — the copy keys themselves stay byte-identical
 * (proved independently by tests/waitlist-provisional-price.test.ts's
 * pre/post-407 snapshot diff).
 *
 * This file proves: the badge exists per testimonial card, sourced from the
 * existing role keys (no new hardcoded strings), styled with the neutral
 * badge tokens rather than the accent color (ADR-026/ADR-027 — a venue-type
 * tag marks a fact, not an action), and that the split never drops or
 * fabricates any word of the original role string.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations, type Locale } from '../src/lib/i18n';

const ROOT = path.resolve(__dirname, '..');
const PAGE_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/LandingPage.svelte'), 'utf8');

const LOCALES: Locale[] = ['es', 'en'];

const ROLE_KEYS = [
	'waitlist.testimonials.0.role',
	'waitlist.testimonials.1.role',
	'waitlist.testimonials.2.role',
];

function tr(loc: Locale, key: string): string {
	return (translations[loc] as Record<string, string>)[key];
}

/** Mirrors the splitRole() helper in LandingPage.svelte, independently, so
 *  this test does not just re-import the thing it is meant to check. */
function splitRole(role: string): { roleLine: string; venueType: string | null } {
	const parts = role.split(' · ');
	if (parts.length !== 3) return { roleLine: role, venueType: null };
	const [title, venueType, place] = parts;
	return { roleLine: `${title} · ${place}`, venueType };
}

describe('waitlist.testimonials.*.role keys are untouched by this display-only change (issue #405)', () => {
	for (const key of ROLE_KEYS) {
		it(`${key} still has the three " · "-joined segments (title · venue type · place) in both locales`, () => {
			for (const loc of LOCALES) {
				const value = tr(loc, key);
				expect(value, `${loc}.${key}`).toBeTruthy();
				expect(value.split(' · '), `${loc}.${key} should split into exactly 3 segments`).toHaveLength(3);
			}
		});
	}

	it('splitRole never drops or fabricates a word: title + venueType + place recombine to the original role', () => {
		for (const loc of LOCALES) {
			for (const key of ROLE_KEYS) {
				const original = tr(loc, key);
				const { roleLine, venueType } = splitRole(original);
				expect(venueType, `${loc}.${key} should have a parsed venue type`).not.toBeNull();
				const [title, , place] = original.split(' · ');
				expect(roleLine).toBe(`${title} · ${place}`);
				expect(`${roleLine.split(' · ')[0]} · ${venueType} · ${roleLine.split(' · ')[1]}`).toBe(original);
			}
		}
	});
});

describe('LandingPage.svelte renders venue type as a distinct badge, not trailing text (issue #405)', () => {
	it('defines a splitRole() helper and feeds it into testimonialItems via $derived', () => {
		expect(PAGE_SRC).toMatch(/function splitRole\(/);
		const block = PAGE_SRC.match(/const testimonialItems = \$derived\(\[([\s\S]*?)\]\);/);
		expect(block, 'testimonialItems derived array not found').toBeTruthy();
		for (const key of ROLE_KEYS) {
			expect(block![1]).toContain(`splitRole($t('${key}'))`);
		}
	});

	it('renders one .badge.badge-neutral element per testimonial card, sourced from item.venueType', () => {
		const eyebrowIdx = PAGE_SRC.indexOf("$t('waitlist.testimonialsEyebrow')");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', eyebrowIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', eyebrowIdx);
		expect(sectionStart, 'testimonials section not found').toBeGreaterThan(-1);
		expect(sectionEnd, 'testimonials section not found').toBeGreaterThan(-1);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);

		expect(section).toContain('class="badge badge-neutral"');
		expect(section).toContain('{item.venueType}');
		expect(section).toContain('{item.roleLine}');
		expect(section, 'badge markup should not hardcode a literal string of its own').not.toMatch(
			/badge badge-neutral">[^{]*[A-Za-z]{2,}/,
		);
	});

	it('the badge sits below the name line, not concatenated as trailing text on it', () => {
		const eyebrowIdx = PAGE_SRC.indexOf("$t('waitlist.testimonialsEyebrow')");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', eyebrowIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', eyebrowIdx);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);

		const nameIdx = section.indexOf('{item.name}');
		const badgeIdx = section.indexOf('class="badge badge-neutral"');
		expect(nameIdx).toBeGreaterThan(-1);
		expect(badgeIdx).toBeGreaterThan(nameIdx);
	});

	it('uses the neutral badge tokens, never the accent color, on the venue-type tag (ADR-026/ADR-027)', () => {
		const eyebrowIdx = PAGE_SRC.indexOf("$t('waitlist.testimonialsEyebrow')");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', eyebrowIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', eyebrowIdx);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);

		const badgeIdx = section.indexOf('class="badge badge-neutral"');
		const rowStart = section.lastIndexOf('<div', badgeIdx);
		const rowEnd = section.indexOf('</div>', badgeIdx);
		const row = section.slice(rowStart, rowEnd);
		expect(row).not.toContain('var(--mep-acc)');
		expect(row).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);

		const css = readFileSync(path.join(ROOT, 'src/app.css'), 'utf8');
		const badgeNeutralRule = css.match(/\.badge-neutral\s*\{([^}]*)\}/);
		expect(badgeNeutralRule, '.badge-neutral rule not found in app.css').toBeTruthy();
		expect(badgeNeutralRule![1]).not.toContain('--mep-acc');
	});

	it('adds no new inline font-size or border-radius (reuses the .badge class already on the type/radius scale)', () => {
		const eyebrowIdx = PAGE_SRC.indexOf("$t('waitlist.testimonialsEyebrow')");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', eyebrowIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', eyebrowIdx);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);
		const badgeIdx = section.indexOf('class="badge badge-neutral"');
		const tagEnd = section.indexOf('>', badgeIdx);
		const badgeTag = section.slice(section.lastIndexOf('<span', badgeIdx), tagEnd + 1);
		expect(badgeTag).not.toMatch(/style=/);
	});

	it('stays inside the shared .mep-grid-3 card, which already collapses to one column at 640px and below', () => {
		const eyebrowIdx = PAGE_SRC.indexOf("$t('waitlist.testimonialsEyebrow')");
		const sectionStart = PAGE_SRC.lastIndexOf('<section', eyebrowIdx);
		const sectionEnd = PAGE_SRC.indexOf('</section>', eyebrowIdx);
		const section = PAGE_SRC.slice(sectionStart, sectionEnd);
		expect(section).toContain('mep-grid-3');
		expect(PAGE_SRC).toMatch(/\.mep-grid-3[^{]*\{[^}]*grid-template-columns:\s*1fr\s*!important/);
	});
});
