import { createHash } from 'crypto';
import fs from 'fs';

export function computeFileHash(filePath: string): string {
	const buf = fs.readFileSync(filePath);
	return createHash('sha256').update(buf).digest('hex');
}

export function computeInvoiceContentHash(fields: {
	supplierName: string;
	invoiceNumber: string;
	invoiceDate: string | null;
	dueDate: string | null;
	totalAmount: number | null;
	lineDescriptions: string[];
	lineQuantities: (number | null)[];
	lineUnits: (string | null)[];
	lineUnitPrices: (number | null)[];
	lineTotalPrices: (number | null)[];
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
