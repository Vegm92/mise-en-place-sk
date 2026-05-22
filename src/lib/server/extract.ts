/**
 * Invoice extraction — classifies a file, prepares input for Gemini,
 * and returns structured invoice data. No DB access, no side effects.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL } from './env';

const EXTRACTION_PROMPT = `You are an invoice data extraction specialist for Spanish restaurants. Extract all relevant information from this document and return it as a JSON object.

The document may be a FACTURA (invoice) or an ALBARÁN (delivery note / nota de entrega). Both are common in Spanish restaurant supplier workflows:
- Facturas include IVA breakdowns (base imponible, cuota IVA, tipo IVA), número de factura, fecha de vencimiento, and CIF/NIF for both parties.
- Albaranes are delivery notes: they list delivered products with quantities and sometimes unit prices, but may lack a total, IVA breakdown, or formal invoice number. Use the albarán number (nº albarán, nº pedido, referencia) as the invoice_number if no factura number is present.

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
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "currency": "3-letter code, almost always EUR for Spanish documents",
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit": "string or null",
      "unit_price": number or null,
      "total_price": number or null,
      "confidence": 0.0 to 1.0
    }
  ],
  "field_confidences": {
    "supplier_name": 0.0 to 1.0,
    "invoice_number": 0.0 to 1.0,
    "invoice_date": 0.0 to 1.0,
    "due_date": 0.0 to 1.0,
    "total_amount": 0.0 to 1.0
  },
  "confidence": 0.0 to 1.0
}

Rules:
- total_amount must be the final amount INCLUDING IVA (total a pagar), not the base imponible.
- If IVA is shown separately, sum base imponible + cuota IVA to get total_amount.
- If the document is an albarán with no prices, set total_amount to null and still extract all line item quantities and descriptions.
- Normalise unit values to lowercase abbreviations (kg, L, ud, caja, etc.).
- Do not invent values — use null for any field not clearly present.

Confidence scores (document-level and per-field):
- 0.85+ : Clearly visible and readable
- 0.60-0.84 : Readable with some ambiguity (blur, partial occlusion, handwriting)
- below 0.60 : Poor quality, missing, or illegible
Per-field confidence reflects the legibility of that specific field. The document-level confidence is the overall assessment.`;

export interface ExtractedInvoice {
	supplier_name: string | null;
	invoice_number: string | null;
	invoice_date: string | null;
	due_date: string | null;
	total_amount: number | null;
	currency: string | null;
	confidence: number;
	field_confidences?: {
		supplier_name?: number;
		invoice_number?: number;
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
		confidence?: number;
	}>;
}

type ClassifiedFile = { type: 'text_pdf'; text: string } | { type: 'scanned_pdf' } | { type: 'image' };

const IMAGE_MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png'> = {
	jpg:  'image/jpeg',
	jpeg: 'image/jpeg',
	png:  'image/png',
};

// Abstracted generate function — decoupled from SDK so tests can inject a mock.
export type GenerateFn = (content: string | object[]) => Promise<string>;

function getGenerateFn(): GenerateFn {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
	return async (content) => {
		const contents = typeof content === 'string'
			? content
			: [{ role: 'user', parts: content }];
		const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents });
		return response.text ?? '';
	};
}

const PDF_PARSE_TIMEOUT_MS = 15_000;

async function classifyPdf(filePath: string): Promise<ClassifiedFile> {
	// Dynamic import so pdf-parse can be mocked in tests.
	const pdfParse = (await import('pdf-parse')).default;
	const buf = readFileSync(filePath);
	try {
		const timeout = new Promise<never>((_, rej) =>
			setTimeout(() => rej(new Error('pdf-parse timeout')), PDF_PARSE_TIMEOUT_MS)
		);
		const result = await Promise.race([pdfParse(buf), timeout]);
		const text = result.text.trim();
		return text.length >= 50 ? { type: 'text_pdf', text } : { type: 'scanned_pdf' };
	} catch {
		// pdf-parse fails or times out on some PDFs — fall back to vision.
		return { type: 'scanned_pdf' };
	}
}

export function classifyFile(filePath: string): Promise<ClassifiedFile> | ClassifiedFile {
	const ext = path.extname(filePath).toLowerCase().replace('.', '');
	if (ext === 'pdf') return classifyPdf(filePath);
	if (ext in IMAGE_MEDIA_TYPES) return { type: 'image' };
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
	filePath: string
): Promise<ExtractedInvoice> {
	const generateWithRetry: GenerateFn = (content) => withRetry(() => generate(content));
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
		return JSON.parse(raw) as ExtractedInvoice;
	} catch {
		throw new Error(`Gemini returned invalid JSON: ${raw.slice(0, 200)}`);
	}
}

export async function extractInvoice(
	filePath: string,
	generateOverride?: GenerateFn
): Promise<ExtractedInvoice> {
	const generate = generateOverride ?? getGenerateFn();
	const classified = await classifyFile(filePath);
	return callGemini(generate, classified, filePath);
}
