import { sumCents } from '$lib/money';
import { fractionToPercent, type TaxBand } from '$lib/tax';
import { parseStoredBands } from './rehash';

export interface InvoiceExportTax {
	vatRates:  string | null;
	vatAmount: number | null;
	recAmount: number | null;
}

export function summarizeInvoiceTax(raw: string | null): InvoiceExportTax {
	const bands = (parseStoredBands(raw) ?? []).filter(
		(b): b is TaxBand => !!b && typeof b === 'object' && Number.isFinite(Number(b.tax_amount)),
	);
	if (bands.length === 0) return { vatRates: null, vatAmount: null, recAmount: null };

	const vat = bands.filter((b) => b.type !== 'rec');
	const rec = bands.filter((b) => b.type === 'rec');

	const rates = [...new Set(
		vat.map((b) => fractionToPercent(b.rate)).filter((p): p is number => p !== null),
	)].sort((a, b) => a - b);

	return {
		vatRates:  rates.length ? rates.map((p) => String(p).replace('.', ',')).join(' / ') : null,
		vatAmount: vat.length ? sumCents(vat.map((b) => b.tax_amount)) / 100 : null,
		recAmount: rec.length ? sumCents(rec.map((b) => b.tax_amount)) / 100 : null,
	};
}
