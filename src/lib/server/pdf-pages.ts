import { PDFDocument } from 'pdf-lib';

export interface PageRange {
	start: number;
	end: number;
}

export const PDF_PAGE_READ_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
	let handle: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, rej) => {
		handle = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
	});
	return Promise.race([work, timeout]).finally(() => clearTimeout(handle!)) as Promise<T>;
}

async function loadDocument(buf: Buffer): Promise<PDFDocument> {
	return PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true, updateMetadata: false });
}

export async function pdfPageCount(buf: Buffer): Promise<number> {
	const doc = await withTimeout(loadDocument(buf), PDF_PAGE_READ_TIMEOUT_MS, 'pdf page count');
	return doc.getPageCount();
}

export async function pdfPageTexts(buf: Buffer): Promise<string[]> {
	const read = (async () => {
		const { extractText, getDocumentProxy } = await import('unpdf');
		const pdf = await getDocumentProxy(new Uint8Array(buf));
		const { text } = await extractText(pdf, { mergePages: false });
		return (Array.isArray(text) ? text : [text]).map((page) => (page ?? '').trim());
	})();
	return withTimeout(read, PDF_PAGE_READ_TIMEOUT_MS, 'pdf page text extraction');
}

export function rangeIndices(range: PageRange): number[] {
	const indices: number[] = [];
	for (let page = range.start; page <= range.end; page++) indices.push(page - 1);
	return indices;
}

export async function splitPdfRanges(buf: Buffer, ranges: PageRange[]): Promise<Buffer[]> {
	const source = await withTimeout(loadDocument(buf), PDF_PAGE_READ_TIMEOUT_MS, 'pdf split');
	const pageCount = source.getPageCount();
	const out: Buffer[] = [];

	for (const range of ranges) {
		if (range.start < 1 || range.end > pageCount || range.end < range.start) {
			throw new Error(`Page range ${range.start}-${range.end} is outside a ${pageCount}-page document`);
		}
		const target = await PDFDocument.create();
		const copied = await target.copyPages(source, rangeIndices(range));
		for (const page of copied) target.addPage(page);
		out.push(Buffer.from(await target.save()));
	}

	return out;
}

export function rangeSuffix(range: PageRange): string {
	return range.start === range.end ? `p${range.start}` : `p${range.start}-${range.end}`;
}
