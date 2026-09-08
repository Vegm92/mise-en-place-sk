/**
 * Document structure detection — the stage that must exist before extraction.
 *
 * The finding in docs/03_features/multi_invoice_document_detection.md is a
 * silent-corruption risk, not an extraction-quality one: a supplier packet of
 * 18 scanned pages (a cover listing plus 17 facturas) fed whole to a
 * single-invoice extractor comes back looking like one perfectly valid
 * invoice. So the two mistakes this module must never make are symmetric:
 * merging pages that carry different document numbers, and splitting pages
 * that carry the same one. When it cannot tell either way it must say so —
 * 'unclear' routes to human review, which is the only safe third answer.
 */
import { describe, it, expect, vi } from 'vitest';
import {
	detectDocumentStructure, pageSignalsFromText, segmentsFromSignals,
	MAX_STRUCTURE_PAGES, MIN_VISION_CONFIDENCE,
} from '../src/lib/server/document-structure';
import { buildPdf, invoicePage, continuationPage, coverPage, type PageSpec } from './helpers/pdf-fixture';

const LISTING_ROWS = [
	'24-015569-01 01-07-24 01-07-24 169,03 169,03',
	'24-015570-01 01-07-24 01-07-24 411,08 580,11',
	'24-015571-01 01-07-24 01-07-24 59,29 639,40',
];

function visionGenerate(pages: Array<{ page: number; role: string; document_ref?: string | null; confidence?: number }>) {
	return vi.fn(async () => JSON.stringify({
		pages: pages.map((p) => ({
			page: p.page,
			role: p.role,
			document_ref: p.document_ref ?? null,
			confidence: p.confidence ?? 0.95,
		})),
	}));
}

function scannedPages(count: number): PageSpec[] {
	return Array.from({ length: count }, () => ({ lines: [] }));
}

async function structureOf(pages: PageSpec[], generate?: ReturnType<typeof visionGenerate>) {
	return detectDocumentStructure(await buildPdf(pages), generate ? { generate } : {});
}

const TEXT_CASES = [
	{
		label: 'leaves a single-page invoice alone',
		pages: [invoicePage('0010024015569', '01-07-24')],
		kind: 'single',
		segments: [{ start: 1, end: 1 }],
		covers: [],
	},
	{
		label: 'keeps one invoice that spans two pages together',
		pages: [invoicePage('0010024015569', '01-07-24'), continuationPage('0010024015569')],
		kind: 'single',
		segments: [{ start: 1, end: 2 }],
		covers: [],
	},
	{
		label: 'splits three invoices printed into one PDF',
		pages: [
			invoicePage('0010024015569', '01-07-24'),
			invoicePage('0010024015570', '01-07-24'),
			invoicePage('0010024015571', '02-07-24'),
		],
		kind: 'composite',
		segments: [{ start: 1, end: 1 }, { start: 2, end: 2 }, { start: 3, end: 3 }],
		covers: [],
	},
	{
		label: 'drops a cover listing and keeps only the invoices behind it',
		pages: [
			coverPage(LISTING_ROWS),
			invoicePage('0010024015569', '01-07-24'),
			invoicePage('0010024015570', '01-07-24'),
		],
		kind: 'composite',
		segments: [{ start: 2, end: 2 }, { start: 3, end: 3 }],
		covers: [1],
	},
	{
		label: 'does not treat a cover as a document even when it is the only extra page',
		pages: [coverPage(LISTING_ROWS), invoicePage('0010024015569', '01-07-24')],
		kind: 'composite',
		segments: [{ start: 2, end: 2 }],
		covers: [1],
	},
] as const;

describe('detectDocumentStructure — text layer', () => {
	it.each(TEXT_CASES)('$label', async ({ pages, kind, segments, covers }) => {
		const structure = await structureOf([...pages]);

		expect(structure.kind).toBe(kind);
		expect(structure.segments).toEqual(segments);
		expect(structure.coverPages).toEqual(covers);
	});

	it('reads a one-page invoice without opening the text layer at all', async () => {
		expect((await structureOf([invoicePage('0010024015569', '01-07-24')])).detectedBy).toBe('single-page');
	});
});

const UNCLEAR_CASES = [
	{
		label: 'a two-page scan whose page map skips a page',
		pageCount: 3,
		map: [{ page: 1, role: 'document', document_ref: 'A1' }, { page: 2, role: 'document', document_ref: 'A2' }],
	},
	{
		label: 'a page map the classifier is not confident about',
		pageCount: 2,
		map: [
			{ page: 1, role: 'document', document_ref: 'A1', confidence: MIN_VISION_CONFIDENCE - 0.2 },
			{ page: 2, role: 'document', document_ref: 'A2', confidence: 0.95 },
		],
	},
	{
		label: 'a scan the classifier reads as nothing but cover pages',
		pageCount: 2,
		map: [{ page: 1, role: 'cover' }, { page: 2, role: 'cover' }],
	},
] as const;

describe('detectDocumentStructure — scanned documents', () => {
	it('refuses to guess when there is no text layer and no classifier', async () => {
		const structure = await structureOf(scannedPages(3));

		expect(structure.kind).toBe('unclear');
		expect(structure.detectedBy).toBe('none');
	});

	it('segments a scanned packet from the page map the classifier returns', async () => {
		const generate = visionGenerate([
			{ page: 1, role: 'cover' },
			{ page: 2, role: 'document', document_ref: '0010024015569' },
			{ page: 3, role: 'document', document_ref: '0010024015570' },
			{ page: 4, role: 'continuation', document_ref: '0010024015570' },
		]);

		const structure = await structureOf(scannedPages(4), generate);

		expect(generate).toHaveBeenCalledTimes(1);
		expect(structure.kind).toBe('composite');
		expect(structure.detectedBy).toBe('vision');
		expect(structure.segments).toEqual([{ start: 2, end: 2 }, { start: 3, end: 4 }]);
	});

	it('sends the whole scanned file to the classifier as a PDF part, not as text', async () => {
		const generate = visionGenerate([
			{ page: 1, role: 'document', document_ref: 'A1' },
			{ page: 2, role: 'document', document_ref: 'A2' },
		]);

		await structureOf(scannedPages(2), generate);

		const [parts] = generate.mock.calls[0] as unknown as [Array<{ inlineData: { mimeType: string } }>];
		expect(parts[0]!.inlineData.mimeType).toBe('application/pdf');
	});

	it.each(UNCLEAR_CASES)('sends $label to review rather than splitting on it', async ({ pageCount, map }) => {
		const structure = await structureOf(scannedPages(pageCount), visionGenerate([...map]));

		expect(structure.kind).toBe('unclear');
		expect(structure.detectedBy).toBe('vision');
	});

	it('does not pay for a classifier call on a document too long to segment', async () => {
		const generate = visionGenerate([]);

		const structure = await structureOf(scannedPages(MAX_STRUCTURE_PAGES + 1), generate);

		expect(generate).not.toHaveBeenCalled();
		expect(structure.kind).toBe('unclear');
	});
});

describe('page signals', () => {
	it('treats a page with no header and no number as a continuation of the page before it', () => {
		const signals = pageSignalsFromText([
			`FACTURA Num. 0010024015569 FECHA: 01-07-24 ${'linea de producto '.repeat(6)}`,
			`${'mas lineas de producto continuadas '.repeat(4)}`,
		]);

		expect(signals?.map((s) => s.role)).toEqual(['document', 'continuation']);
	});

	it('gives up on the text path when a page carries no readable text', () => {
		expect(pageSignalsFromText([`FACTURA Num. 1 ${'x'.repeat(200)}`, ''])).toBeNull();
	});

	it('never opens a segment on a cover page', () => {
		const segments = segmentsFromSignals([
			{ page: 1, role: 'cover', ref: null, confidence: 1 },
			{ page: 2, role: 'continuation', ref: null, confidence: 1 },
		]);

		expect(segments).toEqual([{ start: 2, end: 2 }]);
	});

});
