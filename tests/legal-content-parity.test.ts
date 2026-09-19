import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { privacyMeta, privacySections } from '../src/lib/content/legal/privacy';
import type { PrivacySection } from '../src/lib/content/legal/privacy';
import { termsMeta, termsSections } from '../src/lib/content/legal/terms';
import type { TermsSection } from '../src/lib/content/legal/terms';

const ROOT = path.resolve(__dirname, '..');

type Loc = 'es' | 'en';

function section<T extends { id: string }>(list: T[], id: T['id']): T {
	const found = list.find((s) => s.id === id);
	if (!found) throw new Error(`section not found: ${id}`);
	return found;
}

function loadPreMigrationCopy(fixture: string): Record<Loc, Record<string, unknown>> {
	const src = readFileSync(path.join(ROOT, 'tests/fixtures', fixture), 'utf8');
	const match = src.match(/const copy = (\{[\s\S]*?\}) as const;/);
	if (!match) throw new Error(`pre-migration copy object literal not found in ${fixture}`);
	const factory = new Function(`return (${match[1]!});`) as () => Record<Loc, Record<string, unknown>>;
	return factory();
}

function buildPrivacyCopy(loc: Loc) {
	const controller = section(privacySections, 'controller') as Extract<PrivacySection, { id: 'controller' }>;
	const dataCollected = section(privacySections, 'dataCollected') as Extract<PrivacySection, { id: 'dataCollected' }>;
	const legalBasis = section(privacySections, 'legalBasis') as Extract<PrivacySection, { id: 'legalBasis' }>;
	const subprocessors = section(privacySections, 'subprocessors') as Extract<PrivacySection, { id: 'subprocessors' }>;
	const transfers = section(privacySections, 'transfers') as Extract<PrivacySection, { id: 'transfers' }>;
	const retention = section(privacySections, 'retention') as Extract<PrivacySection, { id: 'retention' }>;
	const rights = section(privacySections, 'rights') as Extract<PrivacySection, { id: 'rights' }>;
	const cookies = section(privacySections, 'cookies') as Extract<PrivacySection, { id: 'cookies' }>;
	const security = section(privacySections, 'security') as Extract<PrivacySection, { id: 'security' }>;
	const contact = section(privacySections, 'contact') as Extract<PrivacySection, { id: 'contact' }>;

	return {
		pageTitle: privacyMeta.pageTitle[loc],
		back: privacyMeta.back[loc],
		title: privacyMeta.title[loc],
		meta: privacyMeta.dateLine[loc],
		prevails: privacyMeta.prevails[loc],

		h1: controller.heading[loc],
		p1a: controller.lead[loc],
		p1b: controller.text[loc],

		h2: dataCollected.heading[loc],
		d2a1: dataCollected.items[0]!.term[loc],
		d2a2: dataCollected.items[0]!.text[loc],
		d2b1: dataCollected.items[1]!.term[loc],
		d2b2: dataCollected.items[1]!.text[loc],
		d2c1: dataCollected.items[2]!.term[loc],
		d2c2: dataCollected.items[2]!.text[loc],
		d2d1: dataCollected.items[3]!.term[loc],
		d2d2: dataCollected.items[3]!.text[loc],

		h3: legalBasis.heading[loc],
		d3a1: legalBasis.items[0]!.term[loc],
		d3a2: legalBasis.items[0]!.text[loc],
		d3b1: legalBasis.items[1]!.term[loc],
		d3b2: legalBasis.items[1]!.text[loc],
		d3c1: legalBasis.items[2]!.term[loc],
		d3c2: legalBasis.items[2]!.text[loc],

		h4: subprocessors.heading[loc],
		p4: subprocessors.intro[loc],
		thProvider: subprocessors.tableHead.provider[loc],
		thFunction: subprocessors.tableHead.fn[loc],
		thCountry: subprocessors.tableHead.country[loc],
		r1Function: subprocessors.rows[0]!.fn[loc],
		r1Country: subprocessors.rows[0]!.country[loc],
		r2Function: subprocessors.rows[1]!.fn[loc],
		r2Country: subprocessors.rows[1]!.country[loc],
		r3Function: subprocessors.rows[2]!.fn[loc],
		r3Country: subprocessors.rows[2]!.country[loc],
		r4Function: subprocessors.rows[3]!.fn[loc],
		r4Country: subprocessors.rows[3]!.country[loc],
		r5Function: subprocessors.rows[4]!.fn[loc],
		r5Country: subprocessors.rows[4]!.country[loc],

		h5: transfers.heading[loc],
		p5: transfers.text[loc],

		h6: retention.heading[loc],
		d6a: retention.items[0]![loc],
		d6b: retention.items[1]![loc],
		d6c: retention.items[2]![loc],
		d6d: retention.items[3]![loc],

		h7: rights.heading[loc],
		p7a: rights.introPre[loc],
		p7b: rights.introPost[loc],
		d7a1: rights.items[0]!.term[loc],
		d7a2: rights.items[0]!.text[loc],
		d7aEm: rights.items[0]!.emphasis?.[loc],
		d7b1: rights.items[1]!.term[loc],
		d7b2: rights.items[1]!.text[loc],
		d7c1: rights.items[2]!.term[loc],
		d7c2: rights.items[2]!.text[loc],
		d7cEm: rights.items[2]!.emphasis?.[loc],
		d7d1: rights.items[3]!.term[loc],
		d7d2: rights.items[3]!.text[loc],
		d7e1: rights.items[4]!.term[loc],
		d7e2: rights.items[4]!.text[loc],
		p7c1: rights.outroPre[loc],
		p7cStrong: rights.outroStrong[loc],
		p7c2: rights.outroPost[loc],

		h8: cookies.heading[loc],
		p8: cookies.paragraphs[0]![loc],
		p8b: cookies.paragraphs[1]![loc],
		p8c: cookies.linkPre[loc],
		p8cLink: cookies.linkText[loc],
		p8cEnd: cookies.linkPost[loc],

		h9: security.heading[loc],
		p9: security.text[loc],

		h10: contact.heading[loc],
		p10: contact.textPre[loc],

		flTerms: privacyMeta.footer.terms[loc],
		flCookies: privacyMeta.footer.cookies[loc],
		flRefunds: privacyMeta.footer.refunds[loc],
		flLegal: privacyMeta.footer.legal[loc],
		flHome: privacyMeta.footer.home[loc]
	};
}

function buildTermsCopy(loc: Loc) {
	const acceptance = section(termsSections, 'acceptance') as Extract<TermsSection, { id: 'acceptance' }>;
	const description = section(termsSections, 'description') as Extract<TermsSection, { id: 'description' }>;
	const accounts = section(termsSections, 'accounts') as Extract<TermsSection, { id: 'accounts' }>;
	const acceptableUse = section(termsSections, 'acceptableUse') as Extract<TermsSection, { id: 'acceptableUse' }>;
	const ip = section(termsSections, 'ip') as Extract<TermsSection, { id: 'ip' }>;
	const billing = section(termsSections, 'billing') as Extract<TermsSection, { id: 'billing' }>;
	const availability = section(termsSections, 'availability') as Extract<TermsSection, { id: 'availability' }>;
	const liability = section(termsSections, 'liability') as Extract<TermsSection, { id: 'liability' }>;
	const privacy = section(termsSections, 'privacy') as Extract<TermsSection, { id: 'privacy' }>;
	const modifications = section(termsSections, 'modifications') as Extract<TermsSection, { id: 'modifications' }>;
	const termination = section(termsSections, 'termination') as Extract<TermsSection, { id: 'termination' }>;
	const governingLaw = section(termsSections, 'governingLaw') as Extract<TermsSection, { id: 'governingLaw' }>;
	const contact = section(termsSections, 'contact') as Extract<TermsSection, { id: 'contact' }>;

	return {
		pageTitle: termsMeta.pageTitle[loc],
		back: termsMeta.back[loc],
		title: termsMeta.title[loc],
		meta: termsMeta.dateLine[loc],
		prevails: termsMeta.prevails[loc],

		h1: acceptance.heading[loc],
		p1: acceptance.text[loc],

		h2: description.heading[loc],
		p2: description.text[loc],

		h3: accounts.heading[loc],
		d3a: accounts.items[0]![loc],
		d3b: accounts.items[1]![loc],
		d3c: accounts.items[2]![loc],
		d3d: accounts.items[3]![loc],

		h4: acceptableUse.heading[loc],
		p4: acceptableUse.intro[loc],
		d4a: acceptableUse.items[0]![loc],
		d4b: acceptableUse.items[1]![loc],
		d4c: acceptableUse.items[2]![loc],
		d4d: acceptableUse.items[3]![loc],

		h5: ip.heading[loc],
		p5: ip.text[loc],

		h6: billing.heading[loc],
		d6a: billing.items[0]![loc],
		d6b: billing.items[1]![loc],
		d6c: billing.items[2]![loc],
		d6d: billing.items[3]![loc],
		d6e1: billing.linkPre[loc],
		d6eLink: billing.linkText[loc],
		d6e2: billing.linkPost[loc],

		h7: availability.heading[loc],
		p7: availability.text[loc],

		h8: liability.heading[loc],
		p8: liability.text[loc],

		h9: privacy.heading[loc],
		p9a: privacy.textPre[loc],
		p9Link: privacy.linkText[loc],
		p9b: privacy.textPost[loc],

		h10: modifications.heading[loc],
		p10: modifications.text[loc],

		h11: termination.heading[loc],
		p11a: termination.textPre[loc],
		p11Em: termination.emphasis[loc],
		p11b: termination.textPost[loc],

		h12: governingLaw.heading[loc],
		p12: governingLaw.text[loc],

		h13: contact.heading[loc],
		p13: contact.textPre[loc],

		flPrivacy: termsMeta.footer.privacy[loc],
		flCookies: termsMeta.footer.cookies[loc],
		flRefunds: termsMeta.footer.refunds[loc],
		flLegal: termsMeta.footer.legal[loc],
		flHome: termsMeta.footer.home[loc]
	};
}

describe('privacy/terms content migration is byte-identical to the pre-migration inline copy (issue #835)', () => {
	const PRE_PRIVACY = loadPreMigrationCopy('privacy-page-pre-content-c747c69e.txt');
	const PRE_TERMS = loadPreMigrationCopy('terms-page-pre-content-c747c69e.txt');

	it('privacy: es matches the pre-migration copy field for field', () => {
		expect(buildPrivacyCopy('es')).toEqual(PRE_PRIVACY.es);
	});

	it('privacy: en matches the pre-migration copy field for field', () => {
		expect(buildPrivacyCopy('en')).toEqual(PRE_PRIVACY.en);
	});

	it('terms: es matches the pre-migration copy field for field', () => {
		expect(buildTermsCopy('es')).toEqual(PRE_TERMS.es);
	});

	it('terms: en matches the pre-migration copy field for field', () => {
		expect(buildTermsCopy('en')).toEqual(PRE_TERMS.en);
	});

	it('privacy keeps the sub-processor names and contact address that were hardcoded outside the copy object', () => {
		const subprocessors = section(privacySections, 'subprocessors') as Extract<PrivacySection, { id: 'subprocessors' }>;
		expect(subprocessors.rows.map((row) => row.provider.es)).toEqual([
			'Railway Corporation',
			'Google LLC (Gemini API)',
			'Stripe Inc.',
			'Sentry (Functional Software)',
			'Cloudflare, Inc.'
		]);
		expect(privacyMeta.contactEmail).toBe('privacy@mise-place.com');
	});

	it('terms keeps the contact address that was hardcoded outside the copy object', () => {
		expect(termsMeta.contactEmail).toBe('legal@mise-place.com');
	});
});

function assertBilingualParity(value: unknown, label: string): void {
	if (value === null || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		value.forEach((entry, index) => assertBilingualParity(entry, `${label}[${index}]`));
		return;
	}
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record);
	if (keys.length === 2 && keys.includes('es') && keys.includes('en') && typeof record.es === 'string' && typeof record.en === 'string') {
		if (record.es.length === 0) throw new Error(`${label}.es is empty`);
		if (record.en.length === 0) throw new Error(`${label}.en is empty`);
		return;
	}
	for (const key of keys) assertBilingualParity(record[key], `${label}.${key}`);
}

describe('privacy/terms legal content keeps es/en structural parity (issue #835)', () => {
	it('privacy: every expected section is present and every bilingual leaf has both locales', () => {
		expect(privacySections.map((s) => s.id)).toEqual([
			'controller',
			'dataCollected',
			'legalBasis',
			'subprocessors',
			'transfers',
			'retention',
			'rights',
			'cookies',
			'security',
			'contact'
		]);
		expect(() => assertBilingualParity(privacyMeta, 'privacyMeta')).not.toThrow();
		expect(() => assertBilingualParity(privacySections, 'privacySections')).not.toThrow();
	});

	it('terms: every expected section is present and every bilingual leaf has both locales', () => {
		expect(termsSections.map((s) => s.id)).toEqual([
			'acceptance',
			'description',
			'accounts',
			'acceptableUse',
			'ip',
			'billing',
			'availability',
			'liability',
			'privacy',
			'modifications',
			'termination',
			'governingLaw',
			'contact'
		]);
		expect(() => assertBilingualParity(termsMeta, 'termsMeta')).not.toThrow();
		expect(() => assertBilingualParity(termsSections, 'termsSections')).not.toThrow();
	});

	it('the parity guard actually fails when a locale goes missing', () => {
		const broken = [{ id: 'x', heading: { es: 'Hola', en: '' } }];
		expect(() => assertBilingualParity(broken, 'broken')).toThrow(/broken\[0\]\.heading\.en is empty/);
	});
});
