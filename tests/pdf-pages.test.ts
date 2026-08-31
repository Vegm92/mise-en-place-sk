/**
 * The page primitive behind composite-document splitting.
 *
 * Everything the ingestion pipeline does with a multi-invoice PDF rests on
 * three facts being true of this module: it can count pages without loading a
 * renderer, it can read the per-page text layer separately (merged text is
 * what hid the boundaries in the first place), and a split page must survive
 * as a PDF the extractor can still read — same content, one page.
 */
import { describe, it, expect } from 'vitest';
import { pdfPageCount, pdfPageTexts, splitPdfRanges, rangeSuffix } from '../src/lib/server/pdf-pages';
import { buildPdf, invoicePage } from './helpers/pdf-fixture';

const THREE_INVOICES = [
	invoicePage('0010024015569', '01-07-24'),
	invoicePage('0010024015570', '01-07-24'),
	invoicePage('0010024015571', '02-07-24'),
];

describe('pdf-pages', () => {
	it('counts the pages of a composite document', async () => {
		expect(await pdfPageCount(await buildPdf(THREE_INVOICES))).toBe(3);
	});

	it('returns the text layer per page instead of one merged blob', async () => {
		const texts = await pdfPageTexts(await buildPdf(THREE_INVOICES));

		expect(texts).toHaveLength(3);
		expect(texts[0]).toContain('0010024015569');
		expect(texts[0]).not.toContain('0010024015570');
		expect(texts[2]).toContain('0010024015571');
	});

	it('splits ranges into standalone PDFs that keep their own page', async () => {
		const source = await buildPdf(THREE_INVOICES);

		const [second, third] = await splitPdfRanges(source, [{ start: 2, end: 2 }, { start: 3, end: 3 }]);

		expect(await pdfPageCount(second)).toBe(1);
		expect(await pdfPageCount(third)).toBe(1);
		expect((await pdfPageTexts(second))[0]).toContain('0010024015570');
		expect((await pdfPageTexts(third))[0]).toContain('0010024015571');
	});

	it('keeps a multi-page range together in one document', async () => {
		const source = await buildPdf(THREE_INVOICES);

		const [merged] = await splitPdfRanges(source, [{ start: 1, end: 2 }]);

		expect(await pdfPageCount(merged)).toBe(2);
	});

	it('refuses a range the document does not have', async () => {
		const source = await buildPdf(THREE_INVOICES);

		await expect(splitPdfRanges(source, [{ start: 2, end: 9 }])).rejects.toThrow('outside a 3-page document');
	});

	it('names a range the way the split file will be keyed', () => {
		expect(rangeSuffix({ start: 4, end: 4 })).toBe('p4');
		expect(rangeSuffix({ start: 4, end: 6 })).toBe('p4-6');
	});
});
