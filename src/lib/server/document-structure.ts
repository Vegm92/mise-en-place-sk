import { Type, type Schema } from '@google/genai';
import { parseJsonResponse } from './llm-json';
import type { GenerateFn } from './extract';
import { pdfPageCount, pdfPageTexts, type PageRange } from './pdf-pages';

export type PageRole = 'document' | 'continuation' | 'cover';

export interface PageSignal {
	page: number;
	role: PageRole;
	ref: string | null;
	confidence: number;
}

export type StructureKind = 'single' | 'composite' | 'unclear';

export type StructureSource = 'single-page' | 'text' | 'vision' | 'none';

export interface DocumentStructure {
	kind: StructureKind;
	detectedBy: StructureSource;
	pageCount: number;
	segments: PageRange[];
	coverPages: number[];
}

export const MAX_STRUCTURE_PAGES = 40;

export const MIN_PAGE_TEXT_CHARS = 80;

export const MIN_VISION_CONFIDENCE = 0.7;

export const MAX_STRUCTURE_BYTES = 15 * 1024 * 1024;

const COVER_RE = /(?:listado|relaci[oó]n|resumen|extracto|estado)\s+de\s+(?:facturas|albaranes|cuenta|movimientos|cobros)|facturas\s+pendientes|albaranes\s+pendientes|estado\s+de\s+cuenta|statement\s+of\s+account/i;

const HEADER_RE = /\b(?:factura|fra\.?|albar[aá]n|albar[aà]|nota\s+de\s+entrega|invoice|delivery\s+note)\b/i;

const NUMBER_RE = /\b(?:factura|fra\.?|albar[aá]n|albar[aà]|invoice)\b[^\n\p{L}\d]{0,24}(?:n[ºo°.]{0,3}|n[uú]m(?:ero)?\.?|no\.?)?[^\n\p{L}\d]{0,8}([\p{L}]?\d[\d.\-/]{2,})/iu;

const PAGE_OF_RE = /\bp[áa]g(?:ina)?s?\.?\s*(\d{1,3})\s*(?:de|\/|of)\s*(\d{1,3})\b/i;

const CONTINUES_RE = /\b(?:contin[uú]a|continuaci[oó]n|continued|sigue)\b/i;

const DATE_ROW_RE = /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g;

const MIN_COVER_ROWS = 3;

export const STRUCTURE_PROMPT = `You are a document-structure classifier for Spanish restaurant supplier paperwork (facturas and albaranes).

You are given ONE PDF that may hold SEVERAL separate documents printed or scanned together. Do NOT extract invoice fields, line items or totals. Decide only what each page IS.

Return exactly one entry per page, in page order, with:
- "page": 1-based page number.
- "role": one of
  - "document" — the page STARTS a new factura or albarán: it prints its own header (supplier name or logo, document number, date).
  - "continuation" — the page CONTINUES the document that started on an earlier page: carried-over line items or totals, or the same document number as the previous page without a new header.
  - "cover" — the page is not a document of its own: an index or listing of invoices, an account statement, a summary, a separator, an envelope sheet or a blank page.
- "document_ref": the factura/albarán number printed on that page, or null if none is legible.
- "confidence": 0.0 to 1.0 for that role.

Rules:
- The SAME document number repeated on consecutive pages means ONE document: the later pages are "continuation".
- A DIFFERENT document number, or a repeated header block carrying a new number, starts a NEW document: role "document".
- A page listing many document numbers in rows with dates and amounts ("listado de facturas", "relación de facturas", "facturas pendientes", "extracto"/"estado de cuenta") is "cover", never "document".
- Never merge two documents that carry different numbers, and never split one document that carries a single number.
- When you cannot tell, keep the role you consider most likely but report a low confidence — a low confidence sends the document to human review, a wrong boundary corrupts accounting data.`;

const PAGE_SIGNAL_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		page: { type: Type.NUMBER },
		role: { type: Type.STRING, enum: ['document', 'continuation', 'cover'] },
		document_ref: { type: Type.STRING, nullable: true },
		confidence: { type: Type.NUMBER },
	},
	required: ['page', 'role', 'document_ref', 'confidence'],
};

export const STRUCTURE_RESPONSE_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		pages: { type: Type.ARRAY, items: PAGE_SIGNAL_SCHEMA },
	},
	required: ['pages'],
};

interface RawPageMap {
	pages: Array<{ page: number; role: string; document_ref?: string | null; confidence?: number }>;
}

export function isPageMap(value: unknown): value is RawPageMap {
	if (typeof value !== 'object' || value === null) return false;
	const pages = (value as { pages?: unknown }).pages;
	if (!Array.isArray(pages)) return false;
	return pages.every((p) => {
		if (typeof p !== 'object' || p === null) return false;
		const entry = p as Record<string, unknown>;
		return typeof entry.page === 'number' && typeof entry.role === 'string';
	});
}

function normaliseRef(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const digits = raw.replace(/[^\p{L}\d]/gu, '').replace(/^0+/, '');
	return digits.length >= 3 ? digits.toUpperCase() : null;
}

export function pageSignalsFromText(pages: string[]): PageSignal[] | null {
	if (pages.some((text) => text.length < MIN_PAGE_TEXT_CHARS)) return null;

	const signals: PageSignal[] = [];
	let previousRef: string | null = null;

	pages.forEach((text, index) => {
		const page = index + 1;
		const ref = normaliseRef(NUMBER_RE.exec(text)?.[1] ?? null);
		const pageOf = PAGE_OF_RE.exec(text);
		const isCover = COVER_RE.test(text) && (text.match(DATE_ROW_RE)?.length ?? 0) >= MIN_COVER_ROWS;
		const continues = (pageOf ? Number(pageOf[1]) > 1 : false) || CONTINUES_RE.test(text);
		const hasHeader = HEADER_RE.test(text);
		const open = signals.some((s) => s.role !== 'cover');

		let role: PageRole = 'document';
		if (isCover) role = 'cover';
		else if (!open) role = 'document';
		else if (ref && previousRef && ref === previousRef) role = 'continuation';
		else if (ref && previousRef && ref !== previousRef) role = 'document';
		else if (continues || !hasHeader) role = 'continuation';

		if (ref) previousRef = ref;
		signals.push({ page, role, ref, confidence: 1 });
	});

	return signals;
}

export function segmentsFromSignals(signals: PageSignal[]): PageRange[] {
	const segments: PageRange[] = [];
	for (const signal of signals) {
		if (signal.role === 'cover') continue;
		const current = segments.at(-1);
		if (signal.role === 'continuation' && current) {
			current.end = signal.page;
			continue;
		}
		segments.push({ start: signal.page, end: signal.page });
	}
	return segments;
}

export function structureFromSignals(
	signals: PageSignal[],
	pageCount: number,
	detectedBy: StructureSource,
): DocumentStructure {
	const coverPages = signals.filter((s) => s.role === 'cover').map((s) => s.page);
	const segments = segmentsFromSignals(signals);
	const unclear: DocumentStructure = { kind: 'unclear', detectedBy, pageCount, segments: [], coverPages };

	if (!segments.length) return unclear;

	const boundaryConfidence = Math.min(...signals.map((s) => s.confidence));
	if (detectedBy === 'vision' && boundaryConfidence < MIN_VISION_CONFIDENCE) return unclear;

	const spansWholeFile = segments.length === 1
		&& segments[0].start === 1
		&& segments[0].end === pageCount;

	return {
		kind: spansWholeFile ? 'single' : 'composite',
		detectedBy,
		pageCount,
		segments,
		coverPages,
	};
}

export function signalsFromPageMap(map: RawPageMap, pageCount: number): PageSignal[] | null {
	const byPage = new Map<number, PageSignal>();
	for (const entry of map.pages) {
		if (!Number.isInteger(entry.page) || entry.page < 1 || entry.page > pageCount) continue;
		const role: PageRole = entry.role === 'continuation' || entry.role === 'cover' ? entry.role : 'document';
		byPage.set(entry.page, {
			page: entry.page,
			role,
			ref: normaliseRef(entry.document_ref ?? null),
			confidence: typeof entry.confidence === 'number' ? entry.confidence : 0,
		});
	}
	if (byPage.size !== pageCount) return null;
	return [...byPage.values()].sort((a, b) => a.page - b.page);
}

export async function classifyPdfWithVision(
	buf: Buffer,
	pageCount: number,
	generate: GenerateFn,
	signal?: AbortSignal,
): Promise<PageSignal[] | null> {
	const parts = [{ inlineData: { data: buf.toString('base64'), mimeType: 'application/pdf' } }];
	const raw = await generate(parts, signal, STRUCTURE_PROMPT, STRUCTURE_RESPONSE_SCHEMA);
	const map = parseJsonResponse(raw, isPageMap, 'Document structure classifier');
	return signalsFromPageMap(map, pageCount);
}

export interface StructureDeps {
	generate?: GenerateFn;
	signal?: AbortSignal;
}

export async function detectDocumentStructure(
	buf: Buffer,
	deps: StructureDeps = {},
): Promise<DocumentStructure> {
	const pageCount = await pdfPageCount(buf);

	if (pageCount <= 1) {
		return {
			kind: 'single',
			detectedBy: 'single-page',
			pageCount,
			segments: [{ start: 1, end: Math.max(pageCount, 1) }],
			coverPages: [],
		};
	}

	if (pageCount > MAX_STRUCTURE_PAGES) {
		return { kind: 'unclear', detectedBy: 'none', pageCount, segments: [], coverPages: [] };
	}

	const texts = await pdfPageTexts(buf).catch(() => null);
	const textSignals = texts && texts.length === pageCount ? pageSignalsFromText(texts) : null;
	if (textSignals) return structureFromSignals(textSignals, pageCount, 'text');

	if (!deps.generate || buf.length > MAX_STRUCTURE_BYTES) {
		return { kind: 'unclear', detectedBy: 'none', pageCount, segments: [], coverPages: [] };
	}

	const visionSignals = await classifyPdfWithVision(buf, pageCount, deps.generate, deps.signal);
	if (!visionSignals) {
		return { kind: 'unclear', detectedBy: 'vision', pageCount, segments: [], coverPages: [] };
	}
	return structureFromSignals(visionSignals, pageCount, 'vision');
}

export function describeStructure(structure: DocumentStructure): string {
	const ranges = structure.segments.map((s) => (s.start === s.end ? `${s.start}` : `${s.start}-${s.end}`));
	return `${structure.kind} via ${structure.detectedBy}: ${structure.pageCount} page(s), segments [${ranges.join(', ')}], covers [${structure.coverPages.join(', ')}]`;
}
