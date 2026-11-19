/**
 * Copy and layout contracts for in-app photo intake without WhatsApp (C5):
 * the help text matches the formats the uploader really accepts, the photo
 * flow names a document (factura or albarán) instead of albarán only, the env
 * warning no longer mentions WhatsApp, and the consent banner reserves its
 * height so it cannot cover the primary "Extraer datos" button.
 */
import { describe, it, expect } from 'vitest';
import { translations } from '../src/lib/i18n-messages';
import { SUPPORTED_UPLOAD_EXTENSIONS } from '../src/lib/upload-formats';
import { read } from './helpers/i18n-setup';

const LOCALES = ['es', 'en'] as const;
const HELP_KEYS = ['help.start.upload.body', 'help.faq.formats.a'] as const;
const NEUTRAL_KEYS = [
	'upload.captureTip',
	'upload.dropHeadline',
	'upload.extractData1',
	'upload.extractDataN',
	'upload.extractData.one',
	'upload.extractData.other',
] as const;
const ALBARAN_ONLY = /albaranes?\b/i;
const mentionsInvoiceOrNote = { es: /factura/i, en: /invoice/i } as const;

describe('help copy matches the accepted formats (gap 1)', () => {
	it.each(LOCALES.flatMap((l) => HELP_KEYS.map((k) => [l, k] as const)))('%s %s does not promise HEIC', (locale, key) => {
		expect(translations[locale][key]).not.toMatch(/heic/i);
	});

	it.each(LOCALES.flatMap((l) => HELP_KEYS.map((k) => [l, k] as const)))('%s %s lists PDF, JPG, PNG and XML', (locale, key) => {
		for (const fmt of ['PDF', 'JPG', 'PNG', 'XML']) expect(translations[locale][key]).toContain(fmt);
	});

	it.each(LOCALES.flatMap((l) => HELP_KEYS.map((k) => [l, k] as const)))('%s %s points iPhone users at Most Compatible / the camera button', (locale, key) => {
		const copy = translations[locale][key];
		expect(copy).toMatch(locale === 'es' ? /Más compatible/ : /Most Compatible/);
		expect(copy).toMatch(locale === 'es' ? /Tomar foto/ : /Take Photo/);
	});

	it('the formats the help names are exactly the extensions the uploader supports (zip is the folder fallback)', () => {
		expect([...SUPPORTED_UPLOAD_EXTENSIONS].sort()).toEqual(['.jpeg', '.jpg', '.pdf', '.png', '.xml', '.zip']);
	});
});

describe('photo intake copy is document-neutral (gap 5)', () => {
	it.each(LOCALES.flatMap((l) => NEUTRAL_KEYS.map((k) => [l, k] as const)))('%s %s is not albarán-only', (locale, key) => {
		const copy = translations[locale][key];
		const albaranOnly = locale === 'es' ? ALBARAN_ONLY.test(copy) && !mentionsInvoiceOrNote.es.test(copy) : /delivery notes?\b/i.test(copy) && !mentionsInvoiceOrNote.en.test(copy);
		expect(albaranOnly).toBe(false);
	});

	it('the extract button counts documents in every locale and plural form', () => {
		expect(translations.es['upload.extractData.one']).toBe('Extraer datos de 1 documento');
		expect(translations.es['upload.extractData.other']).toBe('Extraer datos de {n} documentos');
		expect(translations.en['upload.extractData.one']).toBe('Extract 1 document');
		expect(translations.en['upload.extractData.other']).toBe('Extract {n} documents');
	});

	it('the capture tip and dropzone name both factura and albarán / invoice and delivery note', () => {
		expect(translations.es['upload.captureTip']).toMatch(/factura o albarán/);
		expect(translations.es['upload.dropHeadline']).toMatch(/facturas o albaranes/);
		expect(translations.en['upload.captureTip']).toMatch(/invoice or delivery note/);
		expect(translations.en['upload.dropHeadline']).toMatch(/invoices or delivery notes/);
	});
});

describe('env warning has no WhatsApp wording (gap 6)', () => {
	it('every [env] warning in env.ts is free of WhatsApp', () => {
		const warnings = read('src/lib/server/env.ts').split('\n').filter((line) => line.includes('console.warn('));
		expect(warnings.length).toBeGreaterThan(0);
		for (const line of warnings) expect(line).not.toMatch(/whatsapp/i);
	});
});

describe('the consent banner cannot cover the upload CTA (gap 4)', () => {
	it('the banner publishes its measured height as --mep-cookie-h and clears it when dismissed', () => {
		const banner = read('src/lib/components/CookieConsent.svelte');
		expect(banner).toContain('bind:clientHeight={bannerHeight}');
		expect(banner).toContain("setProperty('--mep-cookie-h'");
		expect(banner).toContain("removeProperty('--mep-cookie-h')");
		expect(banner).toMatch(/consent === 'unset' \? bannerHeight : 0/);
	});

	it('the app shell shrinks by that height so its bottom-pinned controls sit above the banner', () => {
		const shell = read('src/routes/(app)/+layout.svelte');
		const css = read('src/app.css');
		const rule = css.slice(css.indexOf('.mep-app-shell {'), css.indexOf('}', css.indexOf('.mep-app-shell {')));
		expect(shell).toContain('class="mep mep-app-shell"');
		expect(rule).toContain('height: calc(100vh - var(--mep-cookie-h, 0px));');
		expect(rule).toContain('height: calc(100dvh - var(--mep-cookie-h, 0px));');
	});
});
