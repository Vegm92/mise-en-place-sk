import { createHash } from 'crypto';
import fs from 'fs';
import { moneyToNumber, toMoneyString } from './money';
import type { TaxBand } from '$lib/tax';
import { isoDateOffset } from './dates';

export const SIMILAR_INVOICE_DATE_WINDOW_DAYS = 21;
const SIMILAR_INVOICE_AMOUNT_ABS_TOLERANCE = 0.5;
const SIMILAR_INVOICE_AMOUNT_REL_TOLERANCE = 0.01;

export function amountsAreSimilar(a: number, b: number): boolean {
	const tolerance = Math.max(
		SIMILAR_INVOICE_AMOUNT_ABS_TOLERANCE,
		Math.abs(a) * SIMILAR_INVOICE_AMOUNT_REL_TOLERANCE,
	);
	return Math.abs(a - b) <= tolerance;
}

export { isoDateOffset };

export function findSimilarInvoice<T extends { totalAmount: string | null }>(
	candidates: T[],
	totalAmount: number,
): T | null {
	return candidates.find(c => c.totalAmount != null && amountsAreSimilar(moneyToNumber(c.totalAmount), totalAmount)) ?? null;
}

export function computeFileHash(filePath: string): string {
	const buf = fs.readFileSync(filePath);
	return createHash('sha256').update(buf).digest('hex');
}

export function canonicalTaxBands(bands: TaxBand[] | null | undefined) {
	if (!bands || bands.length === 0) return null;
	return bands
		.map(b => ({
			type: b.type ?? null,
			rate: Math.round((b.rate ?? 0) * 1e6) / 1e6,
			base: toMoneyString(b.base) ?? null,
			amount: toMoneyString(b.tax_amount) ?? null,
		}))
		.sort((a, b) =>
			(a.type ?? '').localeCompare(b.type ?? '')
			|| a.rate - b.rate
			|| (a.base ?? '').localeCompare(b.base ?? ''));
}

export function computeInvoiceContentHash(fields: {
	supplierName: string;
	invoiceNumber: string;
	invoiceDate: string | null;
	dueDate: string | null;
	totalAmount: string | null;
	lineDescriptions: string[];
	lineQuantities: (number | null)[];
	lineUnits: (string | null)[];
	lineUnitPrices: (string | null)[];
	lineTotalPrices: (string | null)[];
	lineTaxRates?: (number | null)[];
	taxBands?: TaxBand[] | null;
}): string {
	const canonical = {
		supplier:   fields.supplierName.toLowerCase().trim(),
		invoiceNum: fields.invoiceNumber.trim(),
		date:       fields.invoiceDate ?? null,
		dueDate:    fields.dueDate ?? null,
		total:      fields.totalAmount,
		lines:      fields.lineDescriptions.map((desc, i) => ({
			desc:  desc.toLowerCase().trim(),
			qty:   fields.lineQuantities[i]  ?? null,
			unit:  (fields.lineUnits[i] ?? '').toLowerCase().trim() || null,
			up:    fields.lineUnitPrices[i]  ?? null,
			tp:    fields.lineTotalPrices[i] ?? null,
			rate:  fields.lineTaxRates?.[i] ?? null,
		})),
		tax:        canonicalTaxBands(fields.taxBands),
	};
	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
