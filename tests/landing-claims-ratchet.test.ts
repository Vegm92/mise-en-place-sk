/**
 * Landing claims ratchet — GEO Phase 0.
 *
 * The waitlist FAQ shipped two claims the marketing rules
 * (docs/onboarding/marketing/00_base/02_reglas_inquebrantables.md, rule 1)
 * list as not-yet-true: a Square/Revo POS integration that is not built, and
 * EU-encryption / never-train assertions that were never confirmed against
 * the actual infrastructure. Prose a human reads sceptically becomes a
 * machine-readable assertion once it is wrapped in FAQPage JSON-LD — quoted
 * back verbatim by generative engines and attributed to us. So the copy is
 * fixed before any structured data is allowed to amplify it.
 *
 * This file is a ratchet, not a description: it fails if the retracted
 * claims come back, and if Review/AggregateRating markup ever appears.
 *
 * The three named "illustrative" testimonials (invented quotes attributed to
 * invented people at invented venues, carrying a disclaimer) were removed
 * outright during the flight-test QA pass: Annex I point 23b of the UCPD, as
 * transposed in art. 20 bis LGDCU, makes presenting consumer reviews that are
 * not genuine a per-se banned practice, and a disclaimer does not cure an
 * invented attributed quote. This file now ratchets their absence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations, type Locale } from '../src/lib/i18n-messages';

const ROOT = path.resolve(__dirname, '..');
const PAGE_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/LandingPage.svelte'), 'utf8');

const LOCALES: Locale[] = ['es', 'en'];

function table(loc: Locale): Record<string, string> {
	return translations[loc] as Record<string, string>;
}

/** Only the public landing surface: these are the strings a generative
 *  engine can read and quote. Admin and in-app copy is out of scope. */
function allCopy(loc: Locale): string {
	return Object.entries(table(loc))
		.filter(([key]) => key.startsWith('waitlist.'))
		.map(([, value]) => value)
		.join('\n');
}

describe('retracted product claims stay retracted', () => {
	const RETRACTED = [/\bSquare\b/i, /\bRevo\b/i];

	for (const loc of LOCALES) {
		for (const pattern of RETRACTED) {
			it(`${loc}: no landing copy claims a ${pattern.source} integration`, () => {
				expect(allCopy(loc)).not.toMatch(pattern);
			});
		}
	}

	for (const loc of LOCALES) {
		it(`${loc}: the POS answer states the integration is not available yet`, () => {
			const answer = table(loc)['waitlist.faq.1.a'];
			expect(answer).toBeTruthy();
			// Pin the guarantee, not the phrasing. This asserted /hoja de ruta/ and
			// /roadmap/ while the answer happened to use those words — but "it is on
			// the roadmap" never itself said "not available", which is what the test
			// name promises and what rule 1 actually requires. Matching the negation
			// of availability holds the copy to the claim regardless of how the
			// roadmap half is worded.
			expect(answer!.toLowerCase()).toMatch(
				loc === 'es' ? /no (est[áa] disponible|disponible)/ : /not (yet )?available/
			);
		});
	}
});

describe('unverified data-handling claims stay out of the copy', () => {
	const UNVERIFIED = [
		/servidores en la UE/i,
		/servidores de la UE/i,
		/servers in the EU/i,
		/EU servers/i,
		/entrenar modelos/i,
		/train public models/i,
	];

	for (const loc of LOCALES) {
		for (const pattern of UNVERIFIED) {
			it(`${loc}: no copy asserts ${pattern.source}`, () => {
				expect(allCopy(loc)).not.toMatch(pattern);
			});
		}
	}
});

describe('no fabricated testimonials on the landing page', () => {
	const TESTIMONIAL_KEYS = /^waitlist\.testimonials/;

	for (const loc of LOCALES) {
		it(`${loc}: no waitlist.testimonials.* keys remain in the table`, () => {
			const keys = Object.keys(table(loc)).filter((k) => TESTIMONIAL_KEYS.test(k));
			expect(keys).toEqual([]);
		});
	}

	it('the page renders no testimonial section', () => {
		expect(PAGE_SRC).not.toContain('waitlist.testimonials');
		expect(PAGE_SRC).not.toContain('splitRole');
	});
});

describe('no review markup on the landing page', () => {
	const FORBIDDEN = ['AggregateRating', 'ratingValue', '"@type":"Review"', "'@type': 'Review'"];

	for (const term of FORBIDDEN) {
		it(`the landing emits no ${term}`, () => {
			expect(PAGE_SRC).not.toContain(term);
		});
	}
});
