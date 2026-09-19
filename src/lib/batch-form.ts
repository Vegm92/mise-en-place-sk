import { str } from './formatters';
import { percentInputValue, percentToFraction, isTaxType } from './tax';
import { isoDateOffset } from './dates';

export type LineItem = {
	description?: string | null;
	quantity?: number | string | null;
	unit?: string | null;
	unit_price?: number | string | null;
	total_price?: number | string | null;
	tax_rate?: number | string | null;
	confidence?: number | null;
	product_code?: string | null;
	product_name?: string | null;
	product_status?: 'exact' | 'fuzzy' | 'pending' | 'new' | null;
	product_suggestion?: { candidateName: string } | null;
};

export type ProductMatch = {
	description: string;
	productId: number | null;
	productName: string;
	status: 'exact' | 'fuzzy' | 'pending' | 'new';
	score: number | null;
	suggestedTaxRate: number | null;
	suggestion?: { candidateName: string; candidateProductId: number } | null;
};

export type BandRow = { rate: string; type: string; base: string; amount: string };

const NET_30_DAYS = 30;

export function priceStr(v: number | string | null | undefined): string {
	const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
	return isNaN(n) ? str(v) : n.toFixed(2);
}

export function normalizeLine(item: LineItem, match?: ProductMatch): LineItem {
	return {
		...item,
		product_name: match && match.status !== 'new' && match.status !== 'pending' ? match.productName : '',
		product_status: match?.status ?? null,
		product_suggestion: match?.suggestion ?? null,
		description: str(item.description),
		quantity: str(item.quantity),
		unit: str(item.unit),
		unit_price: priceStr(item.unit_price),
		total_price: priceStr(item.total_price),
		tax_rate: percentInputValue(item.tax_rate),
	};
}

export function fillMissingLineRates(items: LineItem[], matches: ProductMatch[]): LineItem[] {
	return items.map((i, idx) => {
		if (percentToFraction(i.tax_rate) !== null) return i;
		const suggested = matches[idx]?.suggestedTaxRate;
		return suggested != null ? { ...i, tax_rate: percentInputValue(suggested) } : i;
	});
}

export function docTypeStr(v: unknown): 'factura' | 'albaran' | '' {
	return v === 'factura' || v === 'albaran' ? v : '';
}

export function net30Suggestion(dueDate: string, invoiceDate: string): string {
	if (dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return dueDate;
	return isoDateOffset(invoiceDate, NET_30_DAYS);
}

export function bandRowsFrom(raw: unknown): BandRow[] {
	if (!Array.isArray(raw)) return [];
	return (raw as Array<Record<string, unknown>>).map((b) => ({
		rate: percentInputValue(b.rate as number | null | undefined),
		type: isTaxType(b.type) ? b.type : '',
		base: priceStr(b.base as number | null | undefined),
		amount: priceStr(b.tax_amount as number | null | undefined),
	}));
}
