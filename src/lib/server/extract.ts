/**
 * Invoice extraction — classifies a file, prepares input for Claude,
 * and returns structured invoice data. No DB access, no side effects.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from './env';

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

function getClient(): Anthropic {
	if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
	return new Anthropic({ apiKey: ANTHROPIC_API_KEY, baseURL: 'https://api.anthropic.com' });
}

async function classifyPdf(filePath: string): Promise<ClassifiedFile> {
	// Dynamic import so pdf-parse can be mocked in tests.
	const pdfParse = (await import('pdf-parse')).default;
	const buf = readFileSync(filePath);
	try {
		const result = await pdfParse(buf);
		const text = result.text.trim();
		return text.length >= 50 ? { type: 'text_pdf', text } : { type: 'scanned_pdf' };
	} catch {
		// pdf-parse fails on some real-world PDFs (e.g. "Command token too long").
		// Fall back to vision — send as image and let Claude read it visually.
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
		// Remove opening fence line and closing fence line
		const inner = lines.slice(1, lines.at(-1)?.trim() === '```' ? -1 : undefined);
		return inner.join('\n').trim();
	}
	return trimmed;
}

async function callClaude(
	client: Anthropic,
	classified: ClassifiedFile,
	filePath: string
): Promise<ExtractedInvoice> {
	let response: Anthropic.Message;

	if (classified.type === 'text_pdf') {
		response = await client.messages.create({
			model: 'claude-opus-4-6',
			max_tokens: 2048,
			messages: [{
				role: 'user',
				content: `${EXTRACTION_PROMPT}\n\nINVOICE TEXT:\n${classified.text}`,
			}],
		});
	} else if (classified.type === 'scanned_pdf') {
		// PDF that couldn't yield enough text — use the beta PDF document block.
		// Requires the pdfs-2024-09-25 beta header; use client.beta.messages.create.
		const pdfData = readFileSync(filePath).toString('base64');
		const betaResp = await client.beta.messages.create({
			model: 'claude-opus-4-6',
			max_tokens: 2048,
			betas: ['pdfs-2024-09-25'],
			messages: [{
				role: 'user',
				content: [
					{
						type: 'document',
						source: { type: 'base64', media_type: 'application/pdf', data: pdfData },
					},
					{ type: 'text', text: EXTRACTION_PROMPT },
				],
			}],
		});
		const betaText = betaResp.content?.find((b) => b.type === 'text');
		if (betaText?.type !== 'text') {
			throw new Error('Claude returned no text block for PDF document');
		}
		return JSON.parse(stripFences(betaText.text)) as ExtractedInvoice;
	} else {
		// Image file (jpg/png)
		const ext = path.extname(filePath).toLowerCase().replace('.', '');
		const mediaType = IMAGE_MEDIA_TYPES[ext] ?? 'image/jpeg';
		const imageData = readFileSync(filePath).toString('base64');
		response = await client.messages.create({
			model: 'claude-opus-4-6',
			max_tokens: 2048,
			messages: [{
				role: 'user',
				content: [
					{
						type: 'image',
						source: { type: 'base64', media_type: mediaType, data: imageData },
					},
					{ type: 'text', text: EXTRACTION_PROMPT },
				],
			}],
		});
	}

	const textBlock = response.content?.find((b) => b.type === 'text');
	if (textBlock?.type !== 'text') {
		throw new Error('Claude returned no text block');
	}

	return JSON.parse(stripFences(textBlock.text)) as ExtractedInvoice;
}

export async function extractInvoice(
	filePath: string,
	clientOverride?: Anthropic
): Promise<ExtractedInvoice> {
	const client = clientOverride ?? getClient();
	const classified = await classifyFile(filePath);
	return callClaude(client, classified, filePath);
}
