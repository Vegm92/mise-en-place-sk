import { describe, it, expect } from 'vitest';
import { translations } from '../src/lib/i18n-messages';
import { docKey, documentKind } from '../src/lib/document-type';
import { read } from './helpers/i18n-setup';

const LOCALES = ['es', 'en'] as const;
const WORD = {
	es: { factura: /factura/i, albaran: /albar[aá]n/i },
	en: { factura: /invoice/i, albaran: /delivery note/i },
} as const;
const TYPED_BASES = [
	'field.invoiceNum',
	'field.invoiceDate',
	'extract.lineItems',
	'edit.lineItems',
	'review.docOf',
	'inv.detail.pageTitle',
	'inv.detail.noLines',
] as const;
const NEUTRAL_KEYS = [
	'upload.queueEmpty',
	'confirm.queueOf',
	'extract.invoiceOf',
	'inv.noInvoices',
	'misc.invoice',
	'misc.invoices',
	'misc.invoice.zero',
	'misc.invoice.one',
	'misc.invoice.other',
	'mil.empty',
	'sup.noInvoices',
	'help.start.sub',
	'help.start.upload.title',
	'help.start.upload.action',
	'help.start.confirm.body',
	'help.start.insights.body',
] as const;
const NEUTRAL_BASES = [...TYPED_BASES];

describe('docKey', () => {
	it('picks the variant for a known type and the base key otherwise', () => {
		expect(docKey('field.invoiceNum', 'factura')).toBe('field.invoiceNum.factura');
		expect(docKey('field.invoiceNum', 'albaran')).toBe('field.invoiceNum.albaran');
		for (const raw of [null, undefined, '', 'otro', 42]) {
			expect(docKey('field.invoiceNum', raw)).toBe('field.invoiceNum');
			expect(documentKind(raw)).toBeNull();
		}
	});
});

describe.each(LOCALES)('type-aware document wording (%s)', (locale) => {
	const m = translations[locale] as Record<string, string>;

	it.each(TYPED_BASES)('%s renders per type and falls back to documento', (base) => {
		const factura = m[`${base}.factura`];
		const albaran = m[`${base}.albaran`];
		expect(factura, `${base}.factura`).toBeTruthy();
		expect(albaran, `${base}.albaran`).toBeTruthy();
		expect(factura).toMatch(WORD[locale].factura);
		expect(factura).not.toMatch(WORD[locale].albaran);
		expect(albaran).toMatch(WORD[locale].albaran);
		expect(albaran).not.toMatch(WORD[locale].factura);
		const fallback = m[base];
		expect(fallback).toBeTruthy();
		expect(fallback).not.toMatch(WORD[locale].albaran);
		expect(fallback).not.toMatch(WORD[locale].factura);
	});

	it('keeps the same placeholders in every variant', () => {
		const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
		for (const base of TYPED_BASES) {
			expect(vars(m[`${base}.factura`]!)).toBe(vars(m[base]!));
			expect(vars(m[`${base}.albaran`]!)).toBe(vars(m[base]!));
		}
	});

	it.each(NEUTRAL_KEYS)('%s is document-neutral', (key) => {
		expect(m[key], key).toBeTruthy();
		expect(m[key]).not.toMatch(/albar[aá]n|delivery note/i);
		expect(m[key]).not.toMatch(/factura|invoice/i);
	});

	it('lists and empty states say documentos', () => {
		const word = locale === 'es' ? /documentos?/i : /documents?/i;
		for (const key of ['inv.noInvoices', 'mil.empty', 'sup.noInvoices', 'misc.invoice.zero', 'misc.invoice.other']) {
			expect(m[key], key).toMatch(word);
		}
	});

	it('keeps the Albaranes section name', () => {
		const name = locale === 'es' ? 'Albaranes' : m['nav.invoices'];
		expect(m['nav.invoices']).toBe(name);
	});
});

describe('call sites use docKey with the detected type', () => {
	const sites: [string, RegExp[]][] = [
		['src/routes/(app)/batch/[id]/+page.svelte', [
			/docKey\('field\.invoiceNum', documentTypeInput\)/,
			/docKey\('field\.invoiceDate', documentTypeInput\)/,
			/docKey\('extract\.lineItems', documentTypeInput\)/,
			/docKey\('review\.docOf', documentTypeInput\)/,
		]],
		['src/routes/(app)/invoice/[id]/+page.svelte', [
			/docKey\('field\.invoiceNum', invoice\.document_type\)/,
			/docKey\('extract\.lineItems', invoice\.document_type\)/,
		]],
		['src/routes/(app)/invoice/[id]/edit/+page.svelte', [/docKey\('edit\.lineItems', invoice\.document_type\)/]],
		['src/routes/(app)/invoice/[id]/+page.server.ts', [/titleDocType:\s*row\.document_type/]],
		['src/routes/(app)/+layout.svelte', [/docKey\(page\.data\.title, page\.data\.titleDocType\)/]],
		['src/routes/(app)/invoices/+page.svelte', [/docKey\('inv\.detail\.noLines', inv\.document_type\)/]],
	];
	it.each(sites)('%s', (file, patterns) => {
		const src = read(file);
		for (const p of patterns) expect(src).toMatch(p);
	});
});

describe('i18n scan: no key outside the typed variants is albarán-only in the QA list', () => {
	it('es and en expose the same typed keys', () => {
		for (const base of NEUTRAL_BASES) {
			for (const suffix of ['', '.factura', '.albaran']) {
				expect(translations.es).toHaveProperty(base + suffix);
				expect(translations.en).toHaveProperty(base + suffix);
			}
		}
	});
});

describe('onboarding keeps the CTA above the cookie banner on phones', () => {
	const src = read('src/routes/onboarding/+page.svelte');
	it('has a compact mobile layout and reserves the banner height', () => {
		expect(src).toMatch(/@media \(max-width: 640px\)/);
		expect(read('src/app.css')).toMatch(/\.onb-root \{[^}]*var\(--mep-cookie-h, 0px\)/);
		expect(src).toMatch(/\.onb-card \{ padding: 16px; \}/);
	});
	it('the audit script has a scroll-0 strict mode', () => {
		const audit = read('scripts/cookie-banner-cta-audit.mjs');
		expect(audit).toContain('--at-top');
	});
});
