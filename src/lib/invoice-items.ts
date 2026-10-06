export interface Row {
	description: string | null;
	quantity: string | null;
	unit: string | null;
	unit_price: string | null;
	tax_rate: string | null;
	supplier_sku: string | null;
}

export interface RowWithTotal extends Row {
	total_price: number | null;
}

function parseNum(val: string | number | null | undefined): number {
	if (typeof val === 'number') return val;
	if (typeof val === 'string' && val.length > 0) return parseFloat(val);
	return NaN;
}

export function calcTotal(
	qty: string | number | null | undefined,
	price: string | number | null | undefined
): number | null {
	const q = parseNum(qty);
	const p = parseNum(price);
	if (!Number.isFinite(q) || !Number.isFinite(p)) return null;
	return Math.round(q * p * 100) / 100;
}

export function makeEmptyRow(): Row {
	return { description: '', quantity: '', unit: '', unit_price: '', tax_rate: '', supplier_sku: '' };
}

export function initRows(
	lineItems: Array<{
		description: string | null;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		tax_rate?: number | null;
		supplier_sku?: string | null;
	}>
): Row[] {
	if (lineItems.length === 0) return [makeEmptyRow()];
	return lineItems.map((l) => ({
		description: l.description ?? '',
		quantity: l.quantity != null ? String(l.quantity) : '',
		unit: l.unit ?? '',
		unit_price: l.unit_price != null ? l.unit_price.toFixed(2) : '',
		tax_rate: l.tax_rate != null ? String(l.tax_rate) : '',
		supplier_sku: l.supplier_sku ?? '',
	}));
}

export function addRow(rows: Row[]): Row[] {
	return [...rows, makeEmptyRow()];
}

export function removeRow(rows: Row[], idx: number): Row[] {
	return rows.filter((_, i) => i !== idx);
}

export function updateRow(rows: Row[], idx: number, patch: Partial<Row>): Row[] {
	return rows.map((row, i) => (i === idx ? { ...row, ...patch } : row));
}
