/**
 * Issue #747 item 10 — invoice detail viewer titles the document with its
 * raw storage hash/key, renders an empty box for non-previewable types
 * (XML e-invoices), and labels the download button "Descargar PDF" even
 * when the original is a `.xml`.
 *
 * `invoices.sourceFile` is the storage key (`item.fileKey`, e.g.
 * `whatsapp/<rid>/<uuid>.xml` — `invoice-save.ts:626`), never the uploaded
 * filename; the viewer must never print it directly. Fixed by deriving a
 * `documentDisplayName` from the invoice's own identifier + extension,
 * gating the iframe/preview on a previewable-extension check, and renaming
 * the download action to "Descargar original" / "Download original".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations } from '../src/lib/i18n';

const DESKTOP = path.resolve(__dirname, '..', 'src', 'routes', '(app)', 'invoice', '[id]', '+page.svelte');
const MOBILE = path.resolve(__dirname, '..', 'src', 'lib', 'components', 'mobile', 'MobileInvoiceDetail.svelte');

describe('issue #747 — invoice detail viewer never prints the raw storage key', () => {
	it('desktop viewer no longer prints invoice.source_file directly', () => {
		const source = readFileSync(DESKTOP, 'utf8');
		expect(source).not.toMatch(/\{invoice\.source_file\s*\?\?/);
		expect(source).not.toMatch(/title=\{invoice\.source_file\}/);
		expect(source).toContain('documentDisplayName');
	});

	it('mobile viewer no longer prints invoice.source_file directly', () => {
		const source = readFileSync(MOBILE, 'utf8');
		expect(source).not.toMatch(/\{invoice\.source_file\}/);
		expect(source).toContain('documentDisplayName');
	});

	it('desktop viewer gates the preview on a previewable-extension check', () => {
		const source = readFileSync(DESKTOP, 'utf8');
		expect(source, DESKTOP).toContain('isPreviewable');
		expect(source, DESKTOP).toMatch(/PREVIEWABLE_EXTENSIONS/);
	});

	it('defines a "no preview" note in both locales, distinct from "no file attached"', () => {
		expect(translations.es['inv.detail.noPreview']).toBeTruthy();
		expect(translations.en['inv.detail.noPreview']).toBeTruthy();
		expect(translations.es['inv.detail.noPreview']).not.toBe(translations.es['inv.detail.noFile']);
	});

	it('the desktop download action reads "Descargar original", not "Descargar PDF"', () => {
		const source = readFileSync(DESKTOP, 'utf8');
		expect(source).toContain("$t('inv.detail.downloadOriginal')");
		expect(source).not.toContain('inv.detail.downloadPdf');
		expect(translations.es['inv.detail.downloadOriginal']).toBe('Descargar original');
		expect(translations.en['inv.detail.downloadOriginal']).toBe('Download original');
	});

	it('the mobile download action is no longer hardcoded to the literal "PDF"', () => {
		const source = readFileSync(MOBILE, 'utf8');
		expect(source).not.toMatch(/label:\s*'PDF'/);
		expect(source).toContain("$t('mid.actionDownload')");
	});
});
