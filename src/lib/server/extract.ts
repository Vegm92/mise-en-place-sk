/**
 * Invoice extraction — classifies a file, prepares input for Gemini,
 * and returns structured invoice data. No DB access, no side effects.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { GEMINI_API_KEY } from './env';

const EXTRACTION_PROMPT = `You are an invoice data extraction specialist. Extract all relevant information from this invoice and return it as a JSON object.

Return ONLY valid JSON with this exact structure:
{
  "supplier_name": "string",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "currency": "3-letter code e.g. USD, EUR, MXN",
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit": "string or null",
      "unit_price": number or null,
      "total_price": number or null
    }
  ],
  "confidence": 0.0 to 1.0
}

The confidence score should reflect how certain you are about the extracted data:
- 0.85+ : All key fields clearly visible and readable
- 0.60-0.84 : Most fields readable, some ambiguity
- below 0.60 : Poor quality, missing critical fields`;

export interface ExtractedInvoice {
	supplier_name: string | null;
	invoice_number: string | null;
	invoice_date: string | null;
	due_date: string | null;
	total_amount: number | null;
	currency: string | null;
	confidence: number;
	line_items: Array<{
		description: string;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		total_price: number | null;
	}>;
}

type ClassifiedFile = { type: 'text_pdf'; text: string } | { type: 'scanned_pdf' } | { type: 'image' };

const IMAGE_MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png'> = {
	jpg:  'image/jpeg',
	jpeg: 'image/jpeg',
	png:  'image/png',
};

function getModel(): GenerativeModel {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
	return new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
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

async function callGemini(
	model: GenerativeModel,
	classified: ClassifiedFile,
	filePath: string
): Promise<ExtractedInvoice> {
	let rawText: string;

	if (classified.type === 'text_pdf') {
		const result = await model.generateContent(
			`${EXTRACTION_PROMPT}\n\nINVOICE TEXT:\n${classified.text}`
		);
		rawText = result.response.text();
	} else if (classified.type === 'scanned_pdf') {
		const pdfData = readFileSync(filePath).toString('base64');
		const result = await model.generateContent([
			{ inlineData: { data: pdfData, mimeType: 'application/pdf' } },
			{ text: EXTRACTION_PROMPT },
		]);
		rawText = result.response.text();
	} else {
		// Image file (jpg/png)
		const ext = path.extname(filePath).toLowerCase().replace('.', '');
		const mimeType = IMAGE_MEDIA_TYPES[ext] ?? 'image/jpeg';
		const imageData = readFileSync(filePath).toString('base64');
		const result = await model.generateContent([
			{ inlineData: { data: imageData, mimeType } },
			{ text: EXTRACTION_PROMPT },
		]);
		rawText = result.response.text();
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
	modelOverride?: GenerativeModel
): Promise<ExtractedInvoice> {
	const model = modelOverride ?? getModel();
	const classified = await classifyFile(filePath);
	return callGemini(model, classified, filePath);
}
