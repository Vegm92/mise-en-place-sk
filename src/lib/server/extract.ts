import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Type, type Schema } from '@google/genai';
import { GEMINI_TIMEOUT_MS } from './env';
import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY, PAYMENT_METHODS, isValidPaymentMethod } from '$lib/constants';
import { categoryGuideBlock } from './category-guide';
import { parseJsonResponse } from './llm-json';
import { createGeminiProvider, type LLMUsage } from './llm-provider';
import { parseEinvoice } from './einvoice-parser';
import { normalizeIban, isValidIban } from '$lib/iban';

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
- Payment: forma de pago, modo de pago, condiciones (de pago), pago por, vencimiento; IBAN / cuenta / nº cuenta / CCC
- Taxable base: base imponible, base gravable
- VAT amount: cuota IVA, importe IVA, IVA (rates: 21% general, 10% reducido for food/restaurants, 4% superreducido for basic staples)
- Total: total factura, total albarán, importe total, total a pagar
- Line items: descripción, artículo, referencia, cantidad (qty), unidad (ud, kg, L, caja, garrafa, botella, pack, bandeja), precio unitario (P.U., precio/ud), importe, subtotal

Common Spanish supplier units to recognise: ud (unidad), kg, g, L, ml, caja, garrafa, botella, pack, bandeja, saco, palé, docena, media caja, bulto.

Return ONLY valid JSON with this exact structure:
{
  "supplier_name": "the EMISOR's name — the party that issued the document and is owed the money",
  "supplier_category": "one of the CATEGORY VALUES listed below, or null",
  "supplier_nif": "the EMISOR's CIF or NIF, e.g. B12345678 — or null if not printed",
  "supplier_address": "the EMISOR's postal address as printed (street, city, postal code) — or null if not printed",
  "supplier_email": "the EMISOR's contact email — or null if not printed",
  "supplier_phone": "the EMISOR's contact phone — or null if not printed",
  "receiver_name": "the RECEPTOR's name — the party billed, who owes the money (cliente, destinatario) — or null if not printed",
  "receiver_nif": "the RECEPTOR's CIF or NIF — or null if not printed",
  "receiver_address": "the RECEPTOR's postal address as printed — or null if not printed",
  "payment_method": "one of ${PAYMENT_METHODS.filter((m) => m !== 'otro').join(' | ')} | otro — or null if not printed",
  "iban": "the EMISOR's bank account (IBAN / cuenta / nº cuenta / CCC), as printed — or null if not printed",
  "payment_terms": "payment terms exactly as printed (e.g. '30 días', 'contado', '60 días f.f.') — or null if not printed",
  "invoice_number": "string or null",
  "document_type": "'factura' or 'albaran', or null if you cannot tell which",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "currency": "3-letter code, almost always EUR for Spanish documents",
  "tax_base": total taxable amount before tax (sum of all line totals), or null if not present,
  "tax_breakdown": [
    {"rate": 0.21, "base": 100.00, "tax_amount": 21.00, "type": "iva"}
  ] or null if no tax info is present. One entry per tax rate AND type found. rate is a decimal (0.04, 0.10, 0.21 for Spain; use whatever rate is on the document for other countries). type is "iva" for standard VAT or "rec" for Recargo de Equivalencia (a Spanish surcharge printed as %REC on produce invoices) — omit type if neither label is visible,
  "line_items": [
    {
      "description": "string",
      "product_code": "supplier's product code / SKU (CODI, referencia, código artículo) — or null if not printed",
      "quantity": number or null,
      "unit": "string or null",
      "unit_price": number or null,
      "total_price": number or null,
      "allergens": array of allergen codes PRINTED ON THE DOCUMENT for this line, or null,
      "confidence": 0.0 to 1.0
    }
  ],
  "outstanding_balance": number or null (the outstanding balance owed to the supplier — printed as Saldo, saldo pendiente, saldo anterior, etc. — or null if not present),
  "field_confidences": {
    "supplier_name": 0.0 to 1.0,
    "supplier_nif": 0.0 to 1.0,
    "supplier_category": 0.0 to 1.0,
    "receiver_name": 0.0 to 1.0,
    "receiver_nif": 0.0 to 1.0,
    "invoice_number": 0.0 to 1.0,
    "document_type": 0.0 to 1.0,
    "invoice_date": 0.0 to 1.0,
    "due_date": 0.0 to 1.0,
    "total_amount": 0.0 to 1.0,
    "iban": 0.0 to 1.0
  },
  "confidence": 0.0 to 1.0
}

Rules:
- total_amount must be the final amount INCLUDING all taxes (total a pagar), not the pre-tax base.
- If tax is shown separately, sum tax_base + all tax_amount values to get total_amount (include both IVA and REC amounts).
- tax_breakdown must reflect what is printed on the document or arithmetically inferred (see Tax fallback below) — do not guess rates you cannot derive.
- If a document shows both IVA and Recargo de Equivalencia (REC) columns, emit two separate entries in tax_breakdown: one with type "iva" and one with type "rec".
- If the document is an albarán with no prices, set total_amount to null and still extract all line item quantities and descriptions.

Bottom totals table — scan this first: Spanish albaranes and facturas almost always print a summary row near the bottom with columns such as IMP. BRUTO / BASE IMP. / CUOTA I.V.A. / REC. EQUIV. / TOTAL FACTURA (or similar labels). This row is the primary source for tax_base, tax_breakdown, and total_amount. The IVA rate is often printed as a label INSIDE the CUOTA I.V.A. column (e.g. the column reads "CUOTA I.V.A. 10%" with the euro amount beneath it) — extract rate=0.10 and tax_amount from that cell.

Tax fallback — use arithmetic when OCR is uncertain: After reading all line items, compute line_sum = sum of all line_item total_price values (skip nulls). If line_sum > 0 AND total_amount > line_sum AND tax_breakdown is null or its tax_amount sum does not account for the gap:
  1. gap = round(total_amount − line_sum, 2). This gap is almost certainly tax.
  2. Derive rate = gap / line_sum. Snap to the nearest standard Spanish rate (0.04, 0.10, 0.21) if within 2%.
  3. Emit a tax_breakdown entry: { rate, base: line_sum, tax_amount: gap, type: "iva" }. Do NOT lower the document-level confidence field for this reason alone.
  Only skip this fallback when total_amount equals line_sum (no gap) or when total_amount is null.
- Normalise unit values to lowercase abbreviations (kg, L, ud, caja, etc.).
- Do not invent values — use null for any field not clearly present.
- allergens: ONLY report allergens the document itself prints for that line — a "Contiene:" / "Alérgenos:"
  note, an allergen column, or an explicit icon legend. NEVER infer them from the product name: "pan" does
  not imply gluten and "merluza" does not imply pescado unless the document says so. Allergen information
  is a food-safety declaration; a guess is worse than a null. Use only these codes:
  gluten, crustaceos, huevos, pescado, cacahuetes, soja, lacteos, frutos_cascara, apio, mostaza, sesamo,
  sulfitos, altramuces, moluscos.
Both parties — extract them separately, never pick one:
- Spanish invoices print two parties: the EMISOR (proveedor, quien factura, who is owed the money)
  and the RECEPTOR (cliente, destinatario, quien paga). Return BOTH. Extracting only one and leaving
  the other null is a failure even when the labels are missing: the reader downstream can correct a
  swapped pair, but cannot recover a party you did not report.
- The CIF/NIF is the unique identifier of a party — it outranks every name. The same business may be
  printed under its razón social, its nombre comercial, or an individual's name on three different
  documents; the tax id is the same on all three. Report each party's tax id whenever it is printed,
  and never move a tax id from the party it is printed next to.
- Telling them apart when the document has no "emisor"/"cliente" labels, in order:
  1. Labels and headings: Emisor / Proveedor / Facturado por vs Cliente / Destinatario / Facturar a /
     A la atención de. Any explicit label settles it.
  2. Bank details, IBAN, "forma de pago", logo and letterhead belong to the EMISOR — the party being
     paid prints where to pay it.
  3. Position, and only when you can see the page: on a Spanish invoice the emisor is usually printed
     top-left or in the letterhead, and the receptor in a block to its right or beneath it. When the
     input is a plain text dump instead of an image that geometry is gone — the two blocks arrive in
     whatever order the PDF stored them, which is very often the receptor first — so never treat the
     order the parties appear in as evidence of which one issued the document.
  4. A LOPD/RGPD footer names the data controller, which is the EMISOR.
- If after all of that you genuinely cannot tell which party is which, still return both — put the one
  you consider more likely to be the emisor in supplier_*, and score both receiver_name and
  supplier_name below 0.60 in field_confidences so the uncertainty is visible. Do not return nulls to
  express doubt about which is which; nulls mean "not printed on the document".
- Never fabricate: a party's field is null when the document does not print it.

supplier_category — what this supplier mainly sells or provides, judged from its name, trade, and the line items.

The ONLY permitted values are the ${VALID_CATEGORIES.length - 1} listed between the markers below, or null.
<<<CATEGORY_VALUES>>>
${categoryGuideBlock()}
<<<END_CATEGORY_VALUES>>>

Rules for supplier_category:
- Copy one value EXACTLY as written above (only the name before the dash), including accents and capitalisation.
- If the supplier name alone unambiguously indicates a category (e.g. "Tecno-Frío Hostelería — Servicio Técnico" → Mantenimiento y Reparaciones, "Panadería …" → Panadería y Bollería), use it even if this one invoice has a few items from other categories.
- Return null only when the supplier genuinely spans several categories with no dominant one, or when there is too little information to decide.
- Never translate a value, never invent a new one, and never return "${UNCATEGORIZED_CATEGORY}".
  Anything that is not an exact copy of a listed name is discarded.
- Judge the supplier identity, not just this document: a general wholesaler that happens to have delivered only cheese today is still a general wholesaler, so return null rather than "Lácteos".

Confidence scores (document-level and per-field):
- 0.85+ : Clearly visible and readable
- 0.60-0.84 : Readable with some ambiguity (blur, partial occlusion, handwriting)
- below 0.60 : Poor quality, missing, or illegible
Per-field confidence reflects the legibility of that specific field. The document-level confidence is the overall assessment.
The one exception is supplier_category, which is a judgement rather than a reading: score how certain you
are that the category is right, not how legible the document was. A confident category on a blurry invoice
scores high; a guess from two ambiguous line items on a crisp scan scores low.

QR code: If you can see and decode a QR code on the document, return the full decoded URL in the "qr_url" field. Spanish VERI*FACTU invoices carry an AEAT verification URL (e.g. https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=...&numserie=...&fecha=...&importe=...). If no QR is visible or decodable, set qr_url to null.`;

export const EXTRACTION_PROMPT_REVISION = 'v2';

export const EXTRACTION_PROMPT_VERSION =
	`${EXTRACTION_PROMPT_REVISION}-${createHash('sha256').update(EXTRACTION_PROMPT).digest('hex').slice(0, 12)}`;

export const EINVOICE_PARSER_VERSION = 'einvoice-parser';

export interface ExtractedInvoice {
	supplier_name: string | null;
	supplier_category?: string | null;
	supplier_nif?: string | null;
	supplier_address?: string | null;
	supplier_email?: string | null;
	supplier_phone?: string | null;
	receiver_name?: string | null;
	receiver_nif?: string | null;
	receiver_address?: string | null;
	payment_method?: string | null;
	iban?: string | null;
	payment_terms?: string | null;
	invoice_number: string | null;
	document_type?: 'factura' | 'albaran' | null;
	invoice_date: string | null;
	due_date: string | null;
	total_amount: number | null;
	currency: string | null;
	tax_base: number | null;
	tax_breakdown: Array<{ rate: number; base: number; tax_amount: number; type?: 'iva' | 'rec' }> | null;
	confidence: number;
	field_confidences?: {
		supplier_name?: number;
		supplier_nif?: number;
		supplier_category?: number;
		receiver_name?: number;
		receiver_nif?: number;
		invoice_number?: number;
		document_type?: number;
		invoice_date?: number;
		due_date?: number;
		total_amount?: number;
		iban?: number;
	};
	line_items: Array<{
		description: string;
		product_code?: string | null;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		total_price: number | null;
		allergens?: string[] | null;
		confidence?: number;
	}>;
	outstanding_balance?: number | null;
	qr_url?: string | null;
	qr_mismatch?: boolean;
	e_invoice_format?: 'facturae_322' | 'ubl_21' | null;
}

const TAX_BAND_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		rate: { type: Type.NUMBER },
		base: { type: Type.NUMBER },
		tax_amount: { type: Type.NUMBER },
		type: { type: Type.STRING, enum: ['iva', 'rec'] },
	},
	required: ['rate', 'base', 'tax_amount'],
};

const LINE_ITEM_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		description: { type: Type.STRING },
		product_code: { type: Type.STRING, nullable: true },
		quantity: { type: Type.NUMBER, nullable: true },
		unit: { type: Type.STRING, nullable: true },
		unit_price: { type: Type.NUMBER, nullable: true },
		total_price: { type: Type.NUMBER, nullable: true },
		allergens: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
		confidence: { type: Type.NUMBER },
	},
	required: ['description', 'quantity', 'unit', 'unit_price', 'total_price', 'confidence'],
};

const FIELD_CONFIDENCES_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		supplier_name: { type: Type.NUMBER },
		supplier_nif: { type: Type.NUMBER },
		supplier_category: { type: Type.NUMBER },
		receiver_name: { type: Type.NUMBER },
		receiver_nif: { type: Type.NUMBER },
		invoice_number: { type: Type.NUMBER },
		document_type: { type: Type.NUMBER },
		invoice_date: { type: Type.NUMBER },
		due_date: { type: Type.NUMBER },
		total_amount: { type: Type.NUMBER },
		iban: { type: Type.NUMBER },
	},
	required: [
		'supplier_name', 'supplier_nif', 'supplier_category', 'receiver_name', 'receiver_nif',
		'invoice_number', 'document_type', 'invoice_date', 'due_date', 'total_amount',
	],
};

export const INVOICE_RESPONSE_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		supplier_name: { type: Type.STRING, nullable: true },
		supplier_category: { type: Type.STRING, nullable: true },
		supplier_nif: { type: Type.STRING, nullable: true },
		supplier_address: { type: Type.STRING, nullable: true },
		supplier_email: { type: Type.STRING, nullable: true },
		supplier_phone: { type: Type.STRING, nullable: true },
		receiver_name: { type: Type.STRING, nullable: true },
		receiver_nif: { type: Type.STRING, nullable: true },
		receiver_address: { type: Type.STRING, nullable: true },
		payment_method: { type: Type.STRING, enum: [...PAYMENT_METHODS], nullable: true },
		iban: { type: Type.STRING, nullable: true },
		payment_terms: { type: Type.STRING, nullable: true },
		invoice_number: { type: Type.STRING, nullable: true },
		document_type: { type: Type.STRING, enum: ['factura', 'albaran'], nullable: true },
		invoice_date: { type: Type.STRING, nullable: true },
		due_date: { type: Type.STRING, nullable: true },
		total_amount: { type: Type.NUMBER, nullable: true },
		currency: { type: Type.STRING, nullable: true },
		tax_base: { type: Type.NUMBER, nullable: true },
		tax_breakdown: { type: Type.ARRAY, items: TAX_BAND_SCHEMA, nullable: true },
		outstanding_balance: { type: Type.NUMBER, nullable: true },
		qr_url: { type: Type.STRING, nullable: true },
		field_confidences: FIELD_CONFIDENCES_SCHEMA,
		line_items: { type: Type.ARRAY, items: LINE_ITEM_SCHEMA },
		confidence: { type: Type.NUMBER },
	},
	required: [
		'supplier_name', 'supplier_category', 'supplier_nif', 'supplier_address', 'supplier_email',
		'supplier_phone', 'receiver_name', 'receiver_nif', 'receiver_address',
		'payment_method', 'iban', 'payment_terms',
		'invoice_number', 'document_type', 'invoice_date', 'due_date', 'total_amount',
		'currency', 'tax_base', 'tax_breakdown', 'outstanding_balance', 'qr_url', 'field_confidences',
		'line_items', 'confidence',
	],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || value === undefined || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
	return value === null || value === undefined || typeof value === 'number';
}

function isExtractedInvoiceLineItem(value: unknown): value is ExtractedInvoice['line_items'][number] {
	if (!isPlainObject(value)) return false;
	return isNullableString(value.description)
		&& isNullableNumber(value.quantity)
		&& isNullableString(value.unit)
		&& isNullableNumber(value.unit_price)
		&& isNullableNumber(value.total_price);
}

export function isExtractedInvoice(value: unknown): value is ExtractedInvoice {
	if (!isPlainObject(value)) return false;
	if (!isNullableString(value.supplier_name)) return false;
	if (!isNullableString(value.invoice_number)) return false;
	if (!isNullableString(value.invoice_date)) return false;
	if (!isNullableString(value.due_date)) return false;
	if (!isNullableNumber(value.total_amount)) return false;
	if (!isNullableString(value.currency)) return false;
	if (!isNullableNumber(value.tax_base)) return false;
	if (typeof value.confidence !== 'number') return false;
	if (!Array.isArray(value.line_items)) return false;
	return value.line_items.every(isExtractedInvoiceLineItem);
}

const MAX_SUPPLIER_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 300;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 40;
const MAX_NIF_LENGTH = 40;
const MAX_INVOICE_NUMBER_LENGTH = 100;
const MAX_PAYMENT_TERMS_LENGTH = 100;
const MAX_LINE_DESCRIPTION_LENGTH = 300;
const MAX_PRODUCT_CODE_LENGTH = 100;

const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function sanitizeFreeText(value: string | null | undefined, maxLength: number): string | null {
	if (value == null) return null;
	if (typeof value !== 'string') return null;
	const collapsed = value
		.replace(CONTROL_CHARS_PATTERN, '')
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/ {2,}/g, ' ')
		.trim();
	return collapsed.length > maxLength ? collapsed.slice(0, maxLength) : collapsed;
}

function sanitizeIban(
	rawIban: string | null | undefined,
	fieldConfidences: ExtractedInvoice['field_confidences'],
): { iban: string | null; fieldConfidences: ExtractedInvoice['field_confidences'] } {
	const iban = normalizeIban(rawIban);
	if (!iban) return { iban: null, fieldConfidences };
	if (isValidIban(iban)) return { iban, fieldConfidences };
	return { iban, fieldConfidences: { ...fieldConfidences, iban: 0.5 } };
}

export function sanitizeExtractedInvoice(invoice: ExtractedInvoice): ExtractedInvoice {
	const { iban, fieldConfidences } = sanitizeIban(invoice.iban, invoice.field_confidences);
	return {
		...invoice,
		supplier_name: sanitizeFreeText(invoice.supplier_name, MAX_SUPPLIER_NAME_LENGTH),
		supplier_address: sanitizeFreeText(invoice.supplier_address, MAX_ADDRESS_LENGTH),
		supplier_email: sanitizeFreeText(invoice.supplier_email, MAX_EMAIL_LENGTH),
		supplier_phone: sanitizeFreeText(invoice.supplier_phone, MAX_PHONE_LENGTH),
		supplier_nif: sanitizeFreeText(invoice.supplier_nif, MAX_NIF_LENGTH),
		receiver_name: sanitizeFreeText(invoice.receiver_name, MAX_SUPPLIER_NAME_LENGTH),
		receiver_nif: sanitizeFreeText(invoice.receiver_nif, MAX_NIF_LENGTH),
		receiver_address: sanitizeFreeText(invoice.receiver_address, MAX_ADDRESS_LENGTH),
		payment_method: isValidPaymentMethod(invoice.payment_method) ? invoice.payment_method : null,
		iban,
		payment_terms: sanitizeFreeText(invoice.payment_terms, MAX_PAYMENT_TERMS_LENGTH),
		field_confidences: fieldConfidences,
		invoice_number: sanitizeFreeText(invoice.invoice_number, MAX_INVOICE_NUMBER_LENGTH),
		line_items: (invoice.line_items ?? []).map((item) => ({
			...item,
			description: sanitizeFreeText(item.description, MAX_LINE_DESCRIPTION_LENGTH) ?? '',
			product_code: sanitizeFreeText(item.product_code, MAX_PRODUCT_CODE_LENGTH),
		})),
	};
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

export type GenerateFn = (
	content: string | object[],
	signal?: AbortSignal,
	systemInstruction?: string,
	responseSchema?: Schema,
) => Promise<string>;

function getGenerateFn(): GenerateFn {
	const provider = createGeminiProvider();
	return async (content, signal, systemInstruction, responseSchema) => {
		const resp = await provider.generate(content, signal, systemInstruction, responseSchema);
		return resp.text;
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

function imageMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase().replace('.', '');
	return IMAGE_MEDIA_TYPES[ext] ?? 'image/jpeg';
}

function inlineFilePart(filePath: string, mimeType: string): object[] {
	return [{ inlineData: { data: readFileSync(filePath).toString('base64'), mimeType } }];
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
	const generateWithRetry: GenerateFn = (content, sig, si, schema) => withRetry(() => generate(content, sig, si, schema));
	let rawText: string;

	if (classified.type === 'text_pdf') {
		rawText = await generateWithRetry(`INVOICE TEXT:\n${classified.text}`, signal, EXTRACTION_PROMPT, INVOICE_RESPONSE_SCHEMA);
	} else {
		const mimeType = classified.type === 'scanned_pdf' ? 'application/pdf' : imageMimeType(filePath);
		rawText = await generateWithRetry(inlineFilePart(filePath, mimeType), signal, EXTRACTION_PROMPT, INVOICE_RESPONSE_SCHEMA);
	}

	return parseJsonResponse(rawText, isExtractedInvoice, 'Gemini');
}

export async function extractInvoice(
	filePath: string,
	generateOverride?: GenerateFn
): Promise<ExtractedInvoice> {
	const classified = await classifyFile(filePath);

	if (classified.type === 'xml') {
		const result = parseEinvoice(classified.xml);
		if (!result) throw new Error('Unrecognised XML e-invoice format (not Facturae 3.2.x or UBL 2.1)');
		return sanitizeExtractedInvoice(result);
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
		const invoice = await Promise.race([callGemini(generate, classified, filePath, controller.signal), timeout]);
		return sanitizeExtractedInvoice(invoice);
	} finally {
		clearTimeout(timeoutHandle!);
	}
}

async function callProvider(
	provider: ReturnType<typeof createGeminiProvider>,
	classified: ClassifiedFile,
	filePath: string,
	signal?: AbortSignal,
): Promise<{ invoice: ExtractedInvoice; usage: LLMUsage }> {
	let lastUsage: LLMUsage = { inputTokens: 0, outputTokens: 0, model: provider.model };

	const generateWithRetry = (content: string | object[]) =>
		withRetry(async () => {
			const resp = await provider.generate(content, signal, EXTRACTION_PROMPT, INVOICE_RESPONSE_SCHEMA);
			lastUsage = resp.usage;
			return resp.text;
		});

	let rawText: string;
	if (classified.type === 'text_pdf') {
		rawText = await generateWithRetry(`INVOICE TEXT:\n${classified.text}`);
	} else {
		const mimeType = classified.type === 'scanned_pdf' ? 'application/pdf' : imageMimeType(filePath);
		rawText = await generateWithRetry(inlineFilePart(filePath, mimeType));
	}

	return { invoice: parseJsonResponse(rawText, isExtractedInvoice, 'LLM'), usage: lastUsage };
}

export async function extractWithProvider(
	filePath: string,
	provider?: ReturnType<typeof createGeminiProvider>,
): Promise<{ invoice: ExtractedInvoice; usage: LLMUsage }> {
	const classified = await classifyFile(filePath);

	if (classified.type === 'xml') {
		const result = parseEinvoice(classified.xml);
		if (!result) throw new Error('Unrecognised XML e-invoice format (not Facturae 3.2.x or UBL 2.1)');
		const zeroUsage: LLMUsage = { inputTokens: 0, outputTokens: 0, model: 'xml-parser' };
		return { invoice: sanitizeExtractedInvoice(result), usage: zeroUsage };
	}

	const resolvedProvider = provider ?? createGeminiProvider();

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
		const { invoice, usage } = await Promise.race([callProvider(resolvedProvider, classified, filePath, controller.signal), timeout]);
		return { invoice: sanitizeExtractedInvoice(invoice), usage };
	} finally {
		clearTimeout(timeoutHandle!);
	}
}
