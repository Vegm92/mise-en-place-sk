import { computeInvoiceContentHash } from './dedup';
import { parsePack, type PackInfo } from './products';
import { isValidPaymentMethod } from '$lib/constants';
import { parseQrUrl, detectVerifactuMismatch } from './qr';
import { toMoneyString, moneyToNumber, parseAmount, parsePlainNumber } from './money';
import { bandsFromInputs, taxableBaseMoney, detectTotalMismatch as detectAmountMismatch, type TaxBand } from '$lib/tax';
import { isBlankOrIsoDate, toIsoDate } from './dates';
import type { ExtractedInvoice } from './contracts/extraction-contract.js';
import type { BatchItem } from './batch';
import type { IncidenceKind, IncidenceReason, ReviewState } from '$lib/status';

const MONETARY_LINE_FIELDS = ['line_quantities', 'line_unit_prices', 'line_total_prices', 'line_tax_rates'] as const;
const HEADER_MONEY_FIELDS = ['total_amount', 'gross_amount', 'discount_amount', 'retention_amount', 'retention_rate'] as const;

export function findInvalidMonetaryField(formData: FormData): string | null {
	for (const field of HEADER_MONEY_FIELDS) {
		const raw = formData.get(field);
		if (raw === null) continue;
		if (typeof raw !== 'string') return field;
		if (raw.trim() !== '' && parseAmount(raw) === null) return field;
	}

	const descriptions = formData.getAll('line_descriptions').map(String);
	for (const field of MONETARY_LINE_FIELDS) {
		const values = formData.getAll(field).map(String);
		for (let i = 0; i < descriptions.length; i++) {
			if (!(descriptions[i] ?? '').trim()) continue;
			const raw = values[i];
			if (raw !== undefined && raw.trim() !== '' && parseAmount(raw) === null) return field;
		}
	}

	return null;
}

export type LineFormInput = {
	desc: string;
	qtyFloat: number | null;
	unitPriceFloat: number | null;
	unitVal: string | null;
	totalPriceVal: number | null;
	taxRateVal: number | null;
	pack: PackInfo | null;
	supplierSku: string | null;
	categoryOverride?: string | null;
	productId?: number | null;
	formIndex?: number;
};

export function computeFormContentHash(
	header: {
		supplierName: string;
		invoiceNumber: string;
		invoiceDate: string | null;
		dueDate: string | null;
		totalAmount: string | null;
	},
	formData: FormData,
	taxBands: TaxBand[] | null = null,
): string {
	const descriptions = formData.getAll('line_descriptions').map(String);
	const quantities   = formData.getAll('line_quantities').map(String);
	const units        = formData.getAll('line_units').map(String);
	const unitPrices   = formData.getAll('line_unit_prices').map(String);
	const totalPrices  = formData.getAll('line_total_prices').map(String);
	const taxRates     = formData.getAll('line_tax_rates').map(String);

	const kept: number[] = [];
	for (let i = 0; i < descriptions.length; i++) {
		if ((descriptions[i] ?? '').trim()) kept.push(i);
	}

	return computeInvoiceContentHash({
		...header,
		lineDescriptions: kept.map(i => descriptions[i] ?? ''),
		lineQuantities:   kept.map(i => parsePlainNumber(quantities[i] ?? '')),
		lineUnits:        kept.map(i => units[i]?.trim() || null),
		lineUnitPrices:   kept.map(i => toMoneyString(unitPrices[i])),
		lineTotalPrices:  kept.map(i => toMoneyString(totalPrices[i])),
		lineTaxRates:     kept.map(i => parsePlainNumber(taxRates[i])),
		taxBands,
	});
}

export function resolveTaxBreakdown(
	formData: FormData,
	extractedData: Record<string, unknown> | undefined,
): { taxBase: string | null; taxBreakdown: string | null; bands: TaxBand[] | null } {
	const raw = extractedData?.tax_breakdown;
	const extractedBands = Array.isArray(raw) ? (raw as TaxBand[]) : null;
	const extractedBase = toMoneyString(extractedData?.tax_base as string | number | null | undefined);

	if (formData.get('tax_bands_present') !== null) {
		const rates   = formData.getAll('tax_rates').map(String);
		const types   = formData.getAll('tax_types').map(String);
		const bases   = formData.getAll('tax_bases').map(String);
		const amounts = formData.getAll('tax_amounts').map(String);

		const bands = bandsFromInputs(rates.map((rate, i) => ({
			rate,
			type: types[i] ?? '',
			base: bases[i] ?? '',
			amount: amounts[i] ?? '',
		})));

		if (bands.length) {
			return { taxBase: taxableBaseMoney(bands), taxBreakdown: JSON.stringify(bands), bands };
		}
		return { taxBase: extractedBands ? null : extractedBase, taxBreakdown: null, bands: null };
	}

	return {
		taxBase: extractedBase,
		taxBreakdown: extractedBands ? JSON.stringify(extractedBands) : null,
		bands: extractedBands,
	};
}

export function resolveTotalsBreakdown(
	formData: FormData,
	extractedData: Record<string, unknown> | undefined,
): {
	grossAmount: string | null;
	discountAmount: string | null;
	retentionRate: number | null;
	retentionAmount: string | null;
} {
	const rawGross = formData.has('gross_amount') ? formData.get('gross_amount') : extractedData?.gross_amount;
	const rawDiscount = formData.has('discount_amount') ? formData.get('discount_amount') : extractedData?.discount_amount;
	const rawRetentionRate = formData.has('retention_rate') ? formData.get('retention_rate') : extractedData?.retention_rate;
	const rawRetentionAmount = formData.has('retention_amount') ? formData.get('retention_amount') : extractedData?.retention_amount;

	return {
		grossAmount: toMoneyString(rawGross as string | number | null | undefined),
		discountAmount: toMoneyString(rawDiscount as string | number | null | undefined),
		retentionRate: parsePlainNumber(rawRetentionRate),
		retentionAmount: toMoneyString(rawRetentionAmount as string | number | null | undefined),
	};
}

export function parseLineInputs(formData: FormData): LineFormInput[] {
	const descriptions = formData.getAll('line_descriptions').map(String);
	const quantities   = formData.getAll('line_quantities').map(String);
	const units        = formData.getAll('line_units').map(String);
	const unitPrices   = formData.getAll('line_unit_prices').map(String);
	const totalPrices  = formData.getAll('line_total_prices').map(String);
	const taxRates     = formData.getAll('line_tax_rates').map(String);
	const supplierSkus = formData.getAll('line_supplier_skus').map(String);
	const categoryOverrides = formData.getAll('line_category_overrides').map(String);
	const productIds   = formData.getAll('line_product_ids').map(String);

	const out: LineFormInput[] = [];
	for (let i = 0; i < descriptions.length; i++) {
		const desc = (descriptions[i] ?? '').trim();
		if (!desc) continue;
		const unitVal = units[i]?.trim() || null;
		const productId = Number.parseInt(productIds[i] ?? '', 10);
		out.push({
			desc,
			qtyFloat: parsePlainNumber(quantities[i]),
			unitPriceFloat: parseAmount(unitPrices[i]),
			unitVal,
			totalPriceVal: parseAmount(totalPrices[i]),
			taxRateVal: parsePlainNumber(taxRates[i]),
			pack: parsePack(desc, unitVal),
			supplierSku: supplierSkus[i]?.trim() || null,
			categoryOverride: categoryOverrides[i]?.trim() || null,
			productId: Number.isInteger(productId) && productId > 0 ? productId : null,
			formIndex: i,
		});
	}
	return out;
}

export function detectTotalMismatch(
	lineInputs: LineFormInput[],
	taxBands: TaxBand[] | null,
	totalAmount: string | null,
	extras?: { discountAmount?: string | null; retentionAmount?: string | null },
): boolean {
	return detectAmountMismatch(lineInputs.map((li) => li.totalPriceVal), taxBands, totalAmount, extras);
}

const REVIEW_SIGNAL_REASONS: Record<keyof ReviewSignals, IncidenceReason> = {
	lowConfidenceAcked: 'low_confidence',
	totalMismatch:      'total_mismatch',
	conversionNeeded:   'unit_conversion',
	qrMismatch:         'qr_mismatch',
};

export interface ReviewSignals {
	lowConfidenceAcked: boolean;
	totalMismatch: boolean;
	conversionNeeded: boolean;
	qrMismatch: boolean;
}

export function resolveReviewState(signals: ReviewSignals): {
	reviewState: ReviewState;
	incidenceKind: IncidenceKind | null;
	incidenceReasons: IncidenceReason[] | null;
} {
	const reasons = (Object.keys(REVIEW_SIGNAL_REASONS) as (keyof ReviewSignals)[])
		.filter((signal) => signals[signal])
		.map((signal) => REVIEW_SIGNAL_REASONS[signal]);
	return reasons.length > 0
		? { reviewState: 'incidencia', incidenceKind: 'lectura', incidenceReasons: reasons }
		: { reviewState: 'revisado', incidenceKind: null, incidenceReasons: null };
}

const HEADER_CONFIDENCE_FIELDS = ['supplier_name', 'invoice_number', 'invoice_date', 'due_date', 'total_amount'];

function isLowConfidenceBlocked(item: BatchItem | null, formData: FormData): boolean {
	if (formData.get('low_confidence_ack') === 'true') return false;
	const extractedData = item?.extractedData ?? undefined;
	const fieldConfs = (extractedData?.field_confidences as Record<string, number> | undefined) ?? {};
	const hasLowConf = HEADER_CONFIDENCE_FIELDS.some(f => fieldConfs[f] != null && fieldConfs[f] < 0.85);
	const overallConf = typeof extractedData?.confidence === 'number' ? extractedData.confidence : 1;
	return hasLowConf || overallConf < 0.85;
}

export type FormRejection =
	| { type: 'lowConfidenceBlocked' }
	| { type: 'invalidDate'; field: 'invoice_date' | 'due_date' | 'delivery_date' }
	| { type: 'invalidAmount'; field: string };

export type ParsedInvoiceForm = {
	supplierName: string;
	invoiceNumber: string;
	invoiceDate: string | null;
	dueDate: string | null;
	deliveryDate: string | null;
	totalAmount: string | null;
	confidenceRaw: number | null;
	notes: string | null;
	taxBase: string | null;
	taxBreakdown: string | null;
	taxBands: TaxBand[] | null;
	grossAmount: string | null;
	discountAmount: string | null;
	retentionRate: number | null;
	retentionAmount: string | null;
	contentHash: string;
	documentType: 'factura' | 'albaran' | null;
	paymentMethod: ReturnType<typeof toPaymentMethod>;
	paymentTerms: string | null;
	purchaseOrder: string | null;
	sellerName: string | null;
	deliveryAddress: string | null;
	printedNotes: string | null;
	qrUrl: string | null;
	qrMismatches: ReturnType<typeof detectVerifactuMismatch>;
	lineInputs: LineFormInput[];
	lineDescriptions: string[];
	lineQuantities: string[];
	lineUnits: string[];
	lineUnitPrices: string[];
	lineTotalPrices: string[];
	lowConfidenceAcked: boolean;
	extractedData: Record<string, unknown> | undefined;
	extracted: ExtractedInvoice | undefined;
};

function toPaymentMethod(raw: unknown) {
	return isValidPaymentMethod(raw) ? raw : null;
}

function boundedText(raw: unknown, max: number): string | null {
	return typeof raw === 'string' ? (raw.trim().slice(0, max) || null) : null;
}

export function parseInvoiceForm(
	item: BatchItem | null,
	formData: FormData,
): { ok: false; rejection: FormRejection } | { ok: true; form: ParsedInvoiceForm } {
	const invoiceDateRaw = formData.get('invoice_date');
	const dueDateRaw = formData.get('due_date');
	const deliveryDateRaw = formData.get('delivery_date');
	if (!isBlankOrIsoDate(invoiceDateRaw)) return { ok: false, rejection: { type: 'invalidDate', field: 'invoice_date' } };
	if (!isBlankOrIsoDate(dueDateRaw)) return { ok: false, rejection: { type: 'invalidDate', field: 'due_date' } };
	if (!isBlankOrIsoDate(deliveryDateRaw)) return { ok: false, rejection: { type: 'invalidDate', field: 'delivery_date' } };
	const invalidAmountField = findInvalidMonetaryField(formData);
	if (invalidAmountField) return { ok: false, rejection: { type: 'invalidAmount', field: invalidAmountField } };
	if (isLowConfidenceBlocked(item, formData)) return { ok: false, rejection: { type: 'lowConfidenceBlocked' } };

	const supplierName = (formData.get('supplier_name') as string) ?? '';
	const invoiceNumber = (formData.get('invoice_number') as string) ?? '';
	const invoiceDate = toIsoDate(invoiceDateRaw);
	const dueDate = toIsoDate(dueDateRaw);
	const deliveryDate = toIsoDate(deliveryDateRaw);
	const totalAmount = toMoneyString(formData.get('total_amount') as string | null);
	const notesRaw = (formData.get('notes') as string) ?? '';

	const extractedData = item?.extractedData ?? undefined;
	const { taxBase, taxBreakdown, bands: taxBands } = resolveTaxBreakdown(formData, extractedData);
	const { grossAmount, discountAmount, retentionRate, retentionAmount } = resolveTotalsBreakdown(formData, extractedData);
	const contentHash = computeFormContentHash(
		{ supplierName, invoiceNumber, invoiceDate, dueDate, totalAmount },
		formData,
		taxBands,
	);

	const fieldOrExtracted = (key: string) => formData.has(key) ? formData.get(key) : extractedData?.[key];
	const rawDocumentType = fieldOrExtracted('document_type');
	const rawQrUrl = typeof extractedData?.qr_url === 'string' ? extractedData.qr_url : null;
	const qrResult = rawQrUrl ? parseQrUrl(rawQrUrl) : null;
	const qrMismatches = detectVerifactuMismatch(qrResult, {
		invoice_number: invoiceNumber || null,
		invoice_date: invoiceDate,
		total_amount: totalAmount == null ? null : moneyToNumber(totalAmount),
	});

	return {
		ok: true,
		form: {
			supplierName,
			invoiceNumber,
			invoiceDate,
			dueDate,
			deliveryDate,
			totalAmount,
			confidenceRaw: parsePlainNumber(formData.get('confidence')),
			notes: notesRaw.slice(0, 250) || null,
			taxBase,
			taxBreakdown,
			taxBands,
			grossAmount,
			discountAmount,
			retentionRate,
			retentionAmount,
			contentHash,
			documentType: rawDocumentType === 'factura' || rawDocumentType === 'albaran' ? rawDocumentType : null,
			paymentMethod: toPaymentMethod(fieldOrExtracted('payment_method')),
			paymentTerms: boundedText(fieldOrExtracted('payment_terms'), 100),
			purchaseOrder: boundedText(fieldOrExtracted('purchase_order'), 100),
			sellerName: boundedText(fieldOrExtracted('seller_name'), 200),
			deliveryAddress: boundedText(fieldOrExtracted('delivery_address'), 300),
			printedNotes: boundedText(fieldOrExtracted('printed_notes'), 500),
			qrUrl: qrResult?.url ?? null,
			qrMismatches,
			lineInputs: parseLineInputs(formData),
			lineDescriptions: formData.getAll('line_descriptions') as string[],
			lineQuantities: formData.getAll('line_quantities') as string[],
			lineUnits: formData.getAll('line_units') as string[],
			lineUnitPrices: formData.getAll('line_unit_prices') as string[],
			lineTotalPrices: formData.getAll('line_total_prices') as string[],
			lowConfidenceAcked: formData.get('low_confidence_ack') === 'true',
			extractedData,
			extracted: item?.extractedData as ExtractedInvoice | undefined,
		},
	};
}

export function resolveFormReviewState(form: ParsedInvoiceForm, conversionNeeded: boolean) {
	return resolveReviewState({
		lowConfidenceAcked: form.lowConfidenceAcked,
		totalMismatch: detectTotalMismatch(form.lineInputs, form.taxBands, form.totalAmount, {
			discountAmount: form.discountAmount,
			retentionAmount: form.retentionAmount,
		}) || form.extractedData?.total_mismatch === true,
		conversionNeeded,
		qrMismatch: form.qrMismatches.length > 0,
	});
}
