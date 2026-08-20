import { createHash } from 'crypto';
import fs from 'fs';
import { moneyToNumber } from './money';

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

export function isoDateOffset(dateStr: string, days: number): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

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

export function computeInvoiceContentHash(fields: {
	supplierName: string;
	invoiceNumber: string;
	invoiceDate: string | null;
	dueDate?: string | null;
	totalAmount: string | null;
	lineDescriptions: string[];
	lineQuantities: (number | null)[];
	lineUnits: (string | null)[];
	lineUnitPrices: (string | null)[];
	lineTotalPrices: (string | null)[];
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
		})),
	};
	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
