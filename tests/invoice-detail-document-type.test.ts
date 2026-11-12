import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { documentTypeLabelKey } from '../src/lib/document-type';
import es from '../src/lib/messages/es';
import en from '../src/lib/messages/en';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const DESKTOP = read('src/routes/(app)/invoice/[id]/+page.svelte');
const MOBILE = read('src/lib/components/mobile/MobileInvoiceDetail.svelte');

describe('documentTypeLabelKey', () => {
	it('maps the known document types to their own keys', () => {
		expect(documentTypeLabelKey('factura')).toBe('field.documentType.factura');
		expect(documentTypeLabelKey('albaran')).toBe('field.documentType.albaran');
	});

	it('falls back to the unknown key for anything else', () => {
		for (const v of ['invoice', 'Factura', '', null, undefined]) {
			expect(documentTypeLabelKey(v)).toBe('field.documentType.unknown');
		}
	});

	it('only ever returns keys present in both locale tables', () => {
		for (const v of ['factura', 'albaran', 'invoice']) {
			const key = documentTypeLabelKey(v);
			expect(es).toHaveProperty([key]);
			expect(en).toHaveProperty([key]);
		}
	});
});

describe('invoice detail document type rendering', () => {
	it('never builds the documentType key from the raw value', () => {
		for (const src of [DESKTOP, MOBILE]) {
			expect(src).not.toMatch(/field\.documentType\.\$\{/);
			expect(src).toContain('documentTypeLabelKey(');
		}
	});

	it('does not render the handlerless more-options button on mobile', () => {
		expect(MOBILE).not.toContain('mid.moreOptions');
	});
});
