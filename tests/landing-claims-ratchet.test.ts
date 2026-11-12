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
 *
 * Issue #788 (ICP landing rebuild) extends it from "these claims stay gone"
 * to "no figure ships without a source" (marketing rule 6):
 *
 *   - Every digit in a `waitlist.*` string — after stripping `{placeholders}`,
 *     which are filled from code (the visitor's own calculator input, the
 *     enforced entitlements, PROVISIONAL_PRICE) — must be registered in
 *     SOURCED_FIGURES with its source. A doc-backed source is checked against
 *     the doc, and the citation must be visible on the page next to the figure.
 *   - The hero's euro example is a conditional built from the calculator's
 *     defaults, and the calculator's drift presets are labelled as a scenario
 *     the visitor picks, never as an average or a promise.
 *   - The sample-data card is labelled as sample data, not a customer's.
 *   - No copy claims VERI*FACTU compliance (MDR-001).
 *   - The /l/[variant] overrides still carry a few unsourced figures. They are
 *     frozen in KNOWN_UNSOURCED_VARIANT_FIGURES: a new one fails, and fixing
 *     one fails too until its entry is deleted, so the list can only shrink.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations, type Locale } from '../src/lib/i18n-messages';
import { LANDING_VARIANTS } from '../src/lib/landing-variants';

const ROOT = path.resolve(__dirname, '..');
const PAGE_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/LandingPage.svelte'), 'utf8');
const CALC_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/SavingsCalculator.svelte'), 'utf8');
const PROOF_SRC = readFileSync(path.join(ROOT, 'src/lib/components/landing/SampleProof.svelte'), 'utf8');

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

describe('retracted pain-point stats stay retracted', () => {
	// "4–6 h" (admin time) and "+8 %" (price hikes) were asserted as fact with
	// no source, then dropped from the pain-section stats — but "4–6 horas"
	// survived unnoticed in a sibling compare-section string. These patterns
	// catch any of the three copy tables reintroducing either figure, not just
	// the one key that drifted.
	const RETRACTED_STATS = [/4[\s–-]+6\s*h/i, /\+?\s*8\s*%/];

	for (const loc of LOCALES) {
		for (const pattern of RETRACTED_STATS) {
			it(`${loc}: no landing copy states the retracted ${pattern.source} figure`, () => {
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

function figuresIn(text: string): string[] {
	return text.replace(/\{\w+\}/g, '').match(/\d+(?:[.,]\d+)*/g) ?? [];
}

interface SourcedFigure {
	figures: Record<Locale, string[]>;
	source: string;
	doc?: { path: string; mustContain: string[] };
	citedBy?: { key: string; text: string };
}

const INE_FOOD_CPI: Omit<SourcedFigure, 'figures'> = {
	source: 'INE, IPC alimentos, interanual dic. 2022 (plan de negocio, anexo de fuentes)',
	doc: { path: 'docs/02_product/plan_de_negocio.md', mustContain: ['+15,7 %', 'dic. 2022', 'INE (IPC alimentos +15,7 % dic. 2022)'] },
	citedBy: { key: 'waitlist.pain.2.label', text: 'INE' },
};

const SOURCED_FIGURES: Record<string, SourcedFigure> = {
	'waitlist.pain.2.stat': { ...INE_FOOD_CPI, figures: { es: ['15,7'], en: ['15.7'] } },
	'waitlist.pain.2.label': { ...INE_FOOD_CPI, figures: { es: ['2022'], en: ['2022'] } },
	'waitlist.pain.2.body': { ...INE_FOOD_CPI, figures: { es: ['2022'], en: ['2022'] } },
	'waitlist.footerNote': { source: 'year of publication, not a claim', figures: { es: ['2026'], en: ['2026'] } },
};

describe('every figure in the landing copy carries a source (rule 6, issue #788)', () => {
	for (const loc of LOCALES) {
		it(`${loc}: no waitlist.* string states an unregistered figure`, () => {
			const unsourced = Object.entries(table(loc))
				.filter(([key]) => key.startsWith('waitlist.'))
				.filter(([key, value]) => figuresIn(value).length > 0 && !(key in SOURCED_FIGURES))
				.map(([key, value]) => `${key}: ${figuresIn(value).join(', ')}`);
			expect(unsourced, 'register the source in SOURCED_FIGURES or interpolate the number from code').toEqual([]);
		});
	}

	for (const [key, entry] of Object.entries(SOURCED_FIGURES)) {
		it(`${key} states exactly its registered figures (no stale or drifted entry)`, () => {
			for (const loc of LOCALES) expect(figuresIn(table(loc)[key] ?? ''), `${loc}.${key}`).toEqual(entry.figures[loc]);
		});

		if (entry.doc) {
			it(`${key}: ${entry.doc.path} still backs the figure`, () => {
				const doc = readFileSync(path.join(ROOT, entry.doc!.path), 'utf8');
				for (const needle of entry.doc!.mustContain) expect(doc, needle).toContain(needle);
			});
		}

		if (entry.citedBy) {
			it(`${key}: the page cites the source next to the figure`, () => {
				for (const loc of LOCALES) expect(table(loc)[entry.citedBy!.key], loc).toContain(entry.citedBy!.text);
			});
		}
	}
});

describe('euro figures the page shows are the visitor\'s scenario, not a claim', () => {
	it('the hero headline is a conditional built from placeholders, with no literal figure', () => {
		const opener: Record<Locale, RegExp> = { es: /^Si /, en: /^If / };
		for (const loc of LOCALES) {
			const headline = table(loc)['waitlist.headline']!;
			expect(headline, loc).toMatch(opener[loc]);
			for (const v of ['{spend}', '{pct}', '{yearly}']) expect(headline, `${loc} ${v}`).toContain(v);
			expect(figuresIn(headline), loc).toEqual([]);
		}
	});

	it('the hero fills those placeholders from the calculator defaults, so the two always agree', () => {
		const call = PAGE_SRC.match(/ti\('waitlist\.headline',\s*\{([\s\S]*?)\}\)\)/)?.[1] ?? '';
		expect(call).toContain('DEFAULT_MONTHLY_SPEND');
		expect(call).toContain('DEFAULT_DRIFT');
		expect(call).toContain('heroStake.yearly');
	});

	it('the drift presets are labelled as a scenario the visitor picks, not an average or a promise', () => {
		const label: Record<Locale, RegExp> = { es: /escenario/i, en: /scenario/i };
		const hint: Record<Locale, RegExp> = { es: /supuesto que eliges t[úu].*no una media/i, en: /scenario you choose.*not an industry average/i };
		for (const loc of LOCALES) {
			expect(table(loc)['waitlist.calc.driftLabel'], loc).toMatch(label[loc]);
			expect(table(loc)['waitlist.calc.driftHint'], loc).toMatch(hint[loc]);
		}
		expect(CALC_SRC).toContain("t('waitlist.calc.driftLabel')");
		expect(CALC_SRC).toContain("t('waitlist.calc.driftHint')");
		expect(CALC_SRC).toContain('DRIFT_PRESETS');
	});
});

describe('the sample-data card is labelled as sample data wherever it renders', () => {
	it('the badge and the provenance note say so in both locales', () => {
		const badge: Record<Locale, RegExp> = { es: /datos de muestra/i, en: /sample data/i };
		const note: Record<Locale, RegExp> = { es: /no de un cliente/i, en: /not a customer/i };
		for (const loc of LOCALES) {
			expect(table(loc)['waitlist.proof.badge'], loc).toMatch(badge[loc]);
			expect(table(loc)['waitlist.proof.note'], loc).toMatch(note[loc]);
		}
	});

	it('SampleProof renders both the badge and the note, and the page renders SampleProof', () => {
		expect(PROOF_SRC).toContain("t('waitlist.proof.badge')");
		expect(PROOF_SRC).toContain("t('waitlist.proof.note')");
		expect(PAGE_SRC).toContain('<SampleProof');
	});

	it('the old unlabelled dashboard mocks and their figures are gone', () => {
		expect(PAGE_SRC).not.toMatch(/Mock\b/);
		for (const loc of LOCALES) {
			expect(Object.keys(table(loc)).filter((k) => k.startsWith('waitlist.mock.'))).toEqual([]);
		}
	});
});

describe('no VERI*FACTU compliance claim anywhere on the landing (MDR-001)', () => {
	const CLAIMS = [/cumpl\w*\s+(con\s+)?(la\s+)?(normativa\s+)?veri\W?factu/i, /veri\W?factu[\s-]+compliant/i, /compl(y|ies|iant)\s+with\s+veri\W?factu/i];
	const variantCopy = (loc: Locale) => Object.values(LANDING_VARIANTS).flatMap((v) => Object.values(v.overrides[loc])).join('\n');

	for (const loc of LOCALES) {
		it(`${loc}: neither the base copy nor any variant claims compliance`, () => {
			for (const re of CLAIMS) {
				expect(allCopy(loc), re.source).not.toMatch(re);
				expect(variantCopy(loc), re.source).not.toMatch(re);
			}
		});
	}
});

describe('unsourced figures on the /l/[variant] pages are frozen debt that can only shrink', () => {
	const VARIANT_SOURCED: Record<string, string> = {
		'2027': 'VERI*FACTU start date, RDL 15/2025 (docs/02_product/plan_de_negocio.md §5)',
	};
	const KNOWN_UNSOURCED_VARIANT_FIGURES = [
		'aceite-de-oliva|en|waitlist.pain.0.stat|40',
		'aceite-de-oliva|es|waitlist.pain.0.stat|40',
		'menu-del-dia|en|waitlist.headline|13',
		'menu-del-dia|en|waitlist.ogTitle|13',
		'menu-del-dia|en|waitlist.pain.0.stat|0.42',
		'menu-del-dia|es|waitlist.headline|13',
		'menu-del-dia|es|waitlist.ogTitle|13',
		'menu-del-dia|es|waitlist.pain.0.stat|0,42',
	];

	it('the sourced variant figures are still backed by the plan document', () => {
		const doc = readFileSync(path.join(ROOT, 'docs/02_product/plan_de_negocio.md'), 'utf8');
		expect(doc).toContain('RDL 15/2025');
		expect(doc).toMatch(/1 ene\. 2027/);
	});

	it('no variant adds an unsourced figure, and a fixed one is removed from the list', () => {
		const actual: string[] = [];
		for (const [slug, variant] of Object.entries(LANDING_VARIANTS)) {
			for (const loc of LOCALES) {
				for (const [key, value] of Object.entries(variant.overrides[loc])) {
					for (const figure of figuresIn(value ?? '')) {
						if (!(figure in VARIANT_SOURCED)) actual.push(`${slug}|${loc}|${key}|${figure}`);
					}
				}
			}
		}
		expect(actual.sort()).toEqual([...KNOWN_UNSOURCED_VARIANT_FIGURES].sort());
	});
});
