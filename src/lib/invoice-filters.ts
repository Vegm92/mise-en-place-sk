import { toIsoDate } from './dates';

export const INVOICE_SORT_KEYS = [
	'uploaded_desc',
	'uploaded_asc',
	'invoice_date_desc',
	'invoice_date_asc',
] as const;

export type InvoiceSortKey = (typeof INVOICE_SORT_KEYS)[number];

export const DEFAULT_INVOICE_SORT: InvoiceSortKey = 'uploaded_desc';
export const DEFAULT_INVOICE_PERIOD = '30d';

export interface InvoiceFilters {
	q: string;
	status: string;
	supplier_id: string;
	date_from: string;
	date_to: string;
	uploaded_from: string;
	uploaded_to: string;
	sort: InvoiceSortKey;
}

export const EMPTY_INVOICE_FILTERS: InvoiceFilters = {
	q: '',
	status: '',
	supplier_id: '',
	date_from: '',
	date_to: '',
	uploaded_from: '',
	uploaded_to: '',
	sort: DEFAULT_INVOICE_SORT,
};

export function isInvoiceSortKey(value: string): value is InvoiceSortKey {
	return (INVOICE_SORT_KEYS as readonly string[]).includes(value);
}

function text(params: URLSearchParams, key: string): string {
	return (params.get(key) ?? '').trim();
}

function isoDate(params: URLSearchParams, key: string): string {
	return toIsoDate(params.get(key)) ?? '';
}

export function parseInvoiceFilters(params: URLSearchParams): InvoiceFilters {
	const sort = text(params, 'sort');
	return {
		q:             text(params, 'q'),
		status:        text(params, 'status'),
		supplier_id:   text(params, 'supplier_id'),
		date_from:     isoDate(params, 'date_from'),
		date_to:       isoDate(params, 'date_to'),
		uploaded_from: isoDate(params, 'uploaded_from'),
		uploaded_to:   isoDate(params, 'uploaded_to'),
		sort:          isInvoiceSortKey(sort) ? sort : DEFAULT_INVOICE_SORT,
	};
}

export function countActiveInvoiceFilters(filters: InvoiceFilters): number {
	const values = [
		filters.q, filters.status, filters.supplier_id,
		filters.date_from, filters.date_to,
		filters.uploaded_from, filters.uploaded_to,
	];
	const populated = values.filter(v => (v ?? '').trim() !== '').length;
	return populated + (filters.sort && filters.sort !== DEFAULT_INVOICE_SORT ? 1 : 0);
}

export interface InvoiceListParamExtras {
	period?: string;
	page?: number;
}

export function invoiceFilterParams(
	filters: InvoiceFilters,
	extras: InvoiceListParamExtras = {},
): URLSearchParams {
	const params = new URLSearchParams();
	const set = (key: string, value: string) => {
		const trimmed = (value ?? '').trim();
		if (trimmed) params.set(key, trimmed);
	};
	set('q', filters.q);
	set('status', filters.status);
	set('supplier_id', filters.supplier_id);
	set('date_from', filters.date_from);
	set('date_to', filters.date_to);
	set('uploaded_from', filters.uploaded_from);
	set('uploaded_to', filters.uploaded_to);
	if (filters.sort && filters.sort !== DEFAULT_INVOICE_SORT) params.set('sort', filters.sort);
	if (extras.period && extras.period !== DEFAULT_INVOICE_PERIOD) params.set('period', extras.period);
	if (extras.page && extras.page > 1) params.set('page', String(extras.page));
	return params;
}

export function invoiceFiltersHref(
	filters: InvoiceFilters,
	extras: InvoiceListParamExtras = {},
): string {
	const qs = invoiceFilterParams(filters, extras).toString();
	return qs ? `/invoices?${qs}` : '/invoices';
}

export function defaultFiltersOpen(activeCount: number): boolean {
	return activeCount > 0;
}

export function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, m => `\\${m}`);
}
