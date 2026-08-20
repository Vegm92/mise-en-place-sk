import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT_MS } from './env';
import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { createLLMProvider, type LLMProvider, type LLMUsage } from './llm-provider';
import { parseEinvoice } from './einvoice-parser';

const EXTRACTION_PROMPT = `You are an invoice data extraction specialist for Spanish restaurants. Extract all relevant information from this document and return it as a JSON object.

The document may be a FACTURA (invoice) or an ALBARÁN (delivery note / nota de entrega). Both are common in Spanish restaurant supplier workflows:
- Facturas include IVA breakdowns (base imponible, cuota IVA, tipo IVA), número de factura, fecha de vencimiento, and CIF/NIF for both parties.
- Albaranes are delivery notes: they list delivered products with quantities and sometimes unit prices, but may lack a total, IVA breakdown, or formal invoice number. Use the albarán number (nº albarán, nº pedido, referencia) as the invoice_number if no factura number is present.
- Classify which one this document is in "document_type". Base invoice_number's confidence purely on how legibly that number is printed — a clearly printed albarán number deserves the same high confidence as a clearly printed factura number; do not lower it just because the document is an albarán.

Key Spanish field names to look for:
- Supplier: razón social, proveedor, emisor, nombre empresa, denominación social
- Invoice/delivery number: nº factura, número de factura, nº albarán, referencia, nº pedido
- Date: fecha de emisión, fecha factura, fecha entrega, fecha albarán
- Due date: fecha de vencimiento, vence el, fecha límite pago
- Tax IDs: CIF, NIF, NIF/CIF (format: letter + 8 digits, e.g. B12345678 or 12345678A)
- Taxable base: base imponible, base gravable
- VAT amount: cuota IVA, importe IVA, IVA (rates: 21% general, 10% reducido for food/restaurants, 4% superreducido for basic staples)
- Total: total factura, total albarán, importe total, total a pagar
- Line items: descripción, artículo, referencia, cantidad (qty), unidad (ud, kg, L, caja, garrafa, botella, pack, bandeja), precio unitario (P.U., precio/ud), importe, subtotal

Common Spanish supplier units to recognise: ud (unidad), kg, g, L, ml, caja, garrafa, botella, pack, bandeja, saco, palé, docena, media caja, bulto.

Return ONLY valid JSON with this exact structure:
{
  "supplier_name": "string",
  "supplier_category": "one of the CATEGORY VALUES listed below, or null",
  "supplier_nif": "the SUPPLIER's (emisor/proveedor) CIF or NIF, e.g. B12345678 — or null if not printed",
  "supplier_address": "the SUPPLIER's postal address as printed (street, city, postal code) — or null if not printed",
  "supplier_email": "the SUPPLIER's contact email — or null if not printed",
  "supplier_phone": "the SUPPLIER's contact phone — or null if not printed",
  "invoice_number": "string or null",
  "document_type": "'factura' or 'albaran', or null if you cannot tell which",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "currency": "3-letter code, almost always EUR for Spanish documents",
  "tax_base": total taxable amount before tax (sum of all line totals), or null if not present,
  "tax_breakdown": [
    {"rate": 0.21, "base": 100.00, "tax_amount": 21.00}
  ] or null if no tax info is present. One entry per tax rate found. rate is a decimal (0.04, 0.10, 0.21 for Spain; use whatever rate is on the document for other countries),
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit": "string or null",
      "unit_price": number or null,
      "total_price": number or null,
      "tax_rate": the IVA percentage that applies to THIS specific line as a plain number (e.g. 21, 10, 4 — NOT a decimal fraction), or null if not determinable,
      "confidence": 0.0 to 1.0
    }
  ],
  "field_confidences": {
    "supplier_name": 0.0 to 1.0,
    "supplier_category": 0.0 to 1.0,
    "invoice_number": 0.0 to 1.0,
    "document_type": 0.0 to 1.0,
    "invoice_date": 0.0 to 1.0,
    "due_date": 0.0 to 1.0,
    "total_amount": 0.0 to 1.0
  },
  "confidence": 0.0 to 1.0
}

Rules:
- total_amount must be the final amount INCLUDING all taxes (total a pagar), not the pre-tax base.
- If tax is shown separately, sum tax_base + all tax_amount values to get total_amount.
- tax_breakdown must reflect what is explicitly printed on the document — do not invent rates.
- Assign each line item the tax_rate that applies to it. If the document prints a rate per line, use that.
  If it only prints a single overall rate, apply that rate to every line. If several rates apply and the
  document does not indicate which line carries which rate, use your best judgement from context (e.g. food
  items are typically 10% in Spain, non-food/services typically 21%) and lower that line's confidence
  accordingly rather than leaving tax_rate null.
- If the document is an albarán with no prices, set total_amount to null and still extract all line item quantities and descriptions.
- Normalise unit values to lowercase abbreviations (kg, L, ud, caja, etc.).
- Do not invent values — use null for any field not clearly present.
- Spanish invoices commonly print both parties' details (emisor/proveedor AND cliente/destinatario).
  supplier_nif, supplier_address, supplier_email and supplier_phone must always refer to the
  SUPPLIER issuing the invoice, never the restaurant/client receiving it — when in doubt, or when
  you cannot tell which party a detail belongs to, return null rather than guessing.

supplier_category — what this supplier mainly sells, judged from its name and the line items.

The ONLY permitted values are the ${VALID_CATEGORIES.length - 1} listed between the markers below, or null.
<<<CATEGORY_VALUES>>>
${VALID_CATEGORIES.filter(c => c !== UNCATEGORIZED_CATEGORY).join('\n')}
<<<END_CATEGORY_VALUES>>>

Rules for supplier_category:
- Copy one value EXACTLY as written above, including accents and capitalisation.
- Return null if none of them clearly fits, if the supplier sells across several with no dominant
  one, or if the line items are too sparse to tell. Null is the correct, expected answer in those
  cases — it is not a failure.
- Never translate a value, never invent a new one, and never return "${UNCATEGORIZED_CATEGORY}".
  Anything that is not an exact copy of a listed value is discarded.
- Judge the supplier, not this one document: a general wholesaler that happens to have delivered only
  cheese today is still a general wholesaler, so return null rather than "Lácteos".

Confidence scores (document-level and per-field):
- 0.85+ : Clearly visible and readable
- 0.60-0.84 : Readable with some ambiguity (blur, partial occlusion, handwriting)
- below 0.60 : Poor quality, missing, or illegible
Per-field confidence reflects the legibility of that specific field. The document-level confidence is the overall assessment.
The one exception is supplier_category, which is a judgement rather than a reading: score how certain you
are that the category is right, not how legible the document was. A confident category on a blurry invoice
scores high; a guess from two ambiguous line items on a crisp scan scores low.

QR code: If you can see and decode a QR code on the document, return the full decoded URL in the "qr_url" field. Spanish VERI*FACTU invoices carry an AEAT verification URL (e.g. https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=...&numserie=...&fecha=...&importe=...). If no QR is visible or decodable, set qr_url to null.`;

export interface ExtractedInvoice {
	supplier_name: string | null;
	supplier_category?: string | null;
	supplier_nif?: string | null;
	supplier_address?: string | null;
	supplier_email?: string | null;
	supplier_phone?: string | null;
	invoice_number: string | null;
	document_type?: 'factura' | 'albaran' | null;
	invoice_date: string | null;
	due_date: string | null;
	total_amount: number | null;
	currency: string | null;
	tax_base: number | null;
	tax_breakdown: Array<{ rate: number; base: number; tax_amount: number }> | null;
	confidence: number;
	field_confidences?: {
		supplier_name?: number;
		supplier_category?: number;
		invoice_number?: number;
		document_type?: number;
		invoice_date?: number;
		due_date?: number;
		total_amount?: number;
	};
	line_items: Array<{
		description: string;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		total_price: number | null;
		tax_rate?: number | null;
		confidence?: number;
	}>;
	qr_url?: string | null;
	qr_mismatch?: boolean;
	e_invoice_format?: 'facturae_322' | 'ubl_21' | null;
}

type ClassifiedFile =
	| { type: 'text_pdf'; text: string }
	| { type: 'scanned_pdf' }
	| { type: 'image' }
	| { type: 'xml'; xml: string };

const IMAGE_MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png'> = {
	jpg:  'image/jpeg',
	jpeg: 'image/jpeg',
	png:  'image/png',
};

export type GenerateFn = (content: string | object[], signal?: AbortSignal) => Promise<string>;

function getGenerateFn(): GenerateFn {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
	return async (content, signal) => {
		const contents = typeof content === 'string'
			? content
			: [{ role: 'user', parts: content }];
		const response = await ai.models.generateContent({
			model: GEMINI_MODEL,
			contents,
			config: signal ? { abortSignal: signal } : undefined,
		});
		return response.text ?? '';
	};
}

const PDF_PARSE_TIMEOUT_MS = 15_000;

async function classifyPdf(filePath: string): Promise<ClassifiedFile> {
	const { extractText, getDocumentProxy } = await import('unpdf');
	const buf = readFileSync(filePath);
	try {
		const timeout = new Promise<never>((_, rej) =>
			setTimeout(() => rej(new Error('pdf text extraction timeout')), PDF_PARSE_TIMEOUT_MS)
		);
		const read = (async () => {
			const pdf = await getDocumentProxy(new Uint8Array(buf));
			const { text } = await extractText(pdf, { mergePages: true });
			return text;
		})();
		const raw = await Promise.race([read, timeout]);
		const text = raw.trim();
		return text.length >= 50 ? { type: 'text_pdf', text } : { type: 'scanned_pdf' };
	} catch {
		return { type: 'scanned_pdf' };
	}
}

export function classifyFile(filePath: string): Promise<ClassifiedFile> | ClassifiedFile {
	const ext = path.extname(filePath).toLowerCase().replace('.', '');
	if (ext === 'pdf') return classifyPdf(filePath);
	if (ext in IMAGE_MEDIA_TYPES) return { type: 'image' };
	if (ext === 'xml') {
		const xml = readFileSync(filePath, 'utf-8');
		return { type: 'xml', xml };
	}
	throw new Error(`Unsupported file type: .${ext}`);
}

function stripFences(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.startsWith('```')) {
		const lines = trimmed.split('\n');
		const inner = lines.slice(1, lines.at(-1)?.trim() === '```' ? -1 : undefined);
		return inner.join('\n').trim();
	}
	return trimmed;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
	const MAX_RETRIES = 3;
	let lastError: unknown;
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;
			const status = (err as { status?: number }).status;
			const isTransient = status === 429 || status === 503;
			if (!isTransient || attempt === MAX_RETRIES) throw err;
			await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
		}
	}
	throw lastError;
}

async function callGemini(
	generate: GenerateFn,
	classified: ClassifiedFile,
	filePath: string,
	signal?: AbortSignal,
): Promise<ExtractedInvoice> {
	const generateWithRetry: GenerateFn = (content, sig) => withRetry(() => generate(content, sig));
	let rawText: string;

	if (classified.type === 'text_pdf') {
		rawText = await generateWithRetry(`${EXTRACTION_PROMPT}\n\nINVOICE TEXT:\n${classified.text}`, signal);
	} else if (classified.type === 'scanned_pdf') {
		const pdfData = readFileSync(filePath).toString('base64');
		rawText = await generateWithRetry([
			{ inlineData: { data: pdfData, mimeType: 'application/pdf' } },
			{ text: EXTRACTION_PROMPT },
		], signal);
	} else {
		const ext = path.extname(filePath).toLowerCase().replace('.', '');
		const mimeType = IMAGE_MEDIA_TYPES[ext] ?? 'image/jpeg';
		const imageData = readFileSync(filePath).toString('base64');
		rawText = await generateWithRetry([
			{ inlineData: { data: imageData, mimeType } },
			{ text: EXTRACTION_PROMPT },
		], signal);
	}

	const raw = stripFences(rawText);
	try {
		return JSON.parse(raw) as ExtractedInvoice;
	} catch {
		throw new Error(`Gemini returned invalid JSON (${raw.length} chars)`);
	}
}

export async function extractInvoice(
	filePath: string,
	generateOverride?: GenerateFn
): Promise<ExtractedInvoice> {
	const classified = await classifyFile(filePath);

	if (classified.type === 'xml') {
		const result = parseEinvoice(classified.xml);
		if (!result) throw new Error('Unrecognised XML e-invoice format (not Facturae 3.2.x or UBL 2.1)');
		return result;
	}

	const generate = generateOverride ?? getGenerateFn();

	const controller = new AbortController();
	let timeoutHandle: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, rej) => {
		timeoutHandle = setTimeout(() => {
			controller.abort();
			const err = new Error(`Gemini extraction timed out after ${GEMINI_TIMEOUT_MS / 1000}s`);
			(err as { code?: string }).code = 'GEMINI_TIMEOUT';
			rej(err);
		}, GEMINI_TIMEOUT_MS);
	});

	try {
		return await Promise.race([callGemini(generate, classified, filePath, controller.signal), timeout]);
	} finally {
		clearTimeout(timeoutHandle!);
	}
}

async function callProvider(
	provider: LLMProvider,
	classified: ClassifiedFile,
	filePath: string,
	signal?: AbortSignal,
): Promise<{ invoice: ExtractedInvoice; usage: LLMUsage }> {
	let lastUsage: LLMUsage = { inputTokens: 0, outputTokens: 0, model: provider.model };

	const generateWithRetry = (content: string | object[]) =>
		withRetry(async () => {
			const resp = await provider.generate(content, signal);
			lastUsage = resp.usage;
			return resp.text;
		});

	let rawText: string;
	if (classified.type === 'text_pdf') {
		rawText = await generateWithRetry(`${EXTRACTION_PROMPT}\n\nINVOICE TEXT:\n${classified.text}`);
	} else if (classified.type === 'scanned_pdf') {
		const pdfData = readFileSync(filePath).toString('base64');
		rawText = await generateWithRetry([
			{ inlineData: { data: pdfData, mimeType: 'application/pdf' } },
			{ text: EXTRACTION_PROMPT },
		]);
	} else {
		const ext = path.extname(filePath).toLowerCase().replace('.', '');
		const mimeType = IMAGE_MEDIA_TYPES[ext] ?? 'image/jpeg';
		const imageData = readFileSync(filePath).toString('base64');
		rawText = await generateWithRetry([
			{ inlineData: { data: imageData, mimeType } },
			{ text: EXTRACTION_PROMPT },
		]);
	}

	const raw = stripFences(rawText);
	try {
		return { invoice: JSON.parse(raw) as ExtractedInvoice, usage: lastUsage };
	} catch {
		throw new Error(`LLM returned invalid JSON (${raw.length} chars)`);
	}
}

export async function extractWithProvider(
	filePath: string,
	provider?: LLMProvider,
): Promise<{ invoice: ExtractedInvoice; usage: LLMUsage }> {
	const classified = await classifyFile(filePath);

	if (classified.type === 'xml') {
		const result = parseEinvoice(classified.xml);
		if (!result) throw new Error('Unrecognised XML e-invoice format (not Facturae 3.2.x or UBL 2.1)');
		const zeroUsage: LLMUsage = { inputTokens: 0, outputTokens: 0, model: 'xml-parser' };
		return { invoice: result, usage: zeroUsage };
	}

	const resolvedProvider = provider ?? createLLMProvider();

	const controller = new AbortController();
	let timeoutHandle: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, rej) => {
		timeoutHandle = setTimeout(() => {
			controller.abort();
			const err = new Error(`LLM extraction timed out after ${GEMINI_TIMEOUT_MS / 1000}s`);
			(err as { code?: string }).code = 'GEMINI_TIMEOUT';
			rej(err);
		}, GEMINI_TIMEOUT_MS);
	});

	try {
		return await Promise.race([callProvider(resolvedProvider, classified, filePath, controller.signal), timeout]);
	} finally {
		clearTimeout(timeoutHandle!);
	}
}
