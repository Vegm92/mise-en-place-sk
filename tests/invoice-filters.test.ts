/**
 * Invoice list filter state (issue #579).
 *
 * The /invoices filter bar is collapsible and applies instantly, which means
 * the same filter set has to survive three hops: URL search params → server
 * `load()` → the filter controls that rebuild the URL on every change. These
 * tests pin the pure layer that all three share — parsing, serialising, the
 * active-filter badge count and the default collapsed state.
 */
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_INVOICE_SORT,
	EMPTY_INVOICE_FILTERS,
	countActiveInvoiceFilters,
	defaultFiltersOpen,
	invoiceFilterParams,
	invoiceFiltersHref,
	parseInvoiceFilters,
	type InvoiceFilters,
} from '../src/lib/invoice-filters';

const params = (qs: string) => new URLSearchParams(qs);

const ALL: InvoiceFilters = {
	q: 'tomate',
	status: 'pending',
	supplier_id: '42',
	category: 'Lácteos',
	date_from: '2026-01-01',
	date_to: '2026-01-31',
	uploaded_from: '2026-02-01',
	uploaded_to: '2026-02-28',
	sort: 'invoice_date_asc',
};

describe('parseInvoiceFilters', () => {
	it('returns the empty filter set for an empty query string', () => {
		expect(parseInvoiceFilters(params(''))).toEqual(EMPTY_INVOICE_FILTERS);
		expect(EMPTY_INVOICE_FILTERS.sort).toBe(DEFAULT_INVOICE_SORT);
	});

	it('reads every filter out of the search params', () => {
		const parsed = parseInvoiceFilters(params(
			'q=tomate&status=pending&supplier_id=42&category=L%C3%A1cteos&date_from=2026-01-01&date_to=2026-01-31' +
			'&uploaded_from=2026-02-01&uploaded_to=2026-02-28&sort=invoice_date_asc'
		));
		expect(parsed).toEqual(ALL);
	});

	it('trims the text query and drops a whitespace-only one', () => {
		expect(parseInvoiceFilters(params('q=%20%20tomate%20%20')).q).toBe('tomate');
		expect(parseInvoiceFilters(params('q=%20%20%20')).q).toBe('');
	});

	it('falls back to the default sort for an unknown sort key', () => {
		expect(parseInvoiceFilters(params('sort=drop_table')).sort).toBe(DEFAULT_INVOICE_SORT);
		expect(parseInvoiceFilters(params('sort=uploaded_asc')).sort).toBe('uploaded_asc');
	});

	it('rejects malformed and impossible dates instead of passing them to SQL', () => {
		expect(parseInvoiceFilters(params('date_from=ayer')).date_from).toBe('');
		expect(parseInvoiceFilters(params('date_to=2026-02-30')).date_to).toBe('');
		expect(parseInvoiceFilters(params('uploaded_from=2026-1-5')).uploaded_from).toBe('');
		expect(parseInvoiceFilters(params('uploaded_to=2026-02-28')).uploaded_to).toBe('2026-02-28');
	});
});

describe('countActiveInvoiceFilters', () => {
	it('is zero for the empty filter set (nothing to badge when collapsed)', () => {
		expect(countActiveInvoiceFilters(EMPTY_INVOICE_FILTERS)).toBe(0);
	});

	it('counts each populated filter once, and the sort only when it is not the default', () => {
		expect(countActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, status: 'paid' })).toBe(1);
		expect(countActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, q: 'tomate', supplier_id: '7' })).toBe(2);
		expect(countActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, sort: DEFAULT_INVOICE_SORT })).toBe(0);
		expect(countActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, sort: 'invoice_date_desc' })).toBe(1);
		expect(countActiveInvoiceFilters(ALL)).toBe(9);
	});

	it('ignores blank and whitespace-only values', () => {
		expect(countActiveInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, q: '   ', status: '' })).toBe(0);
	});

	it('counts what the URL actually carries, via parse', () => {
		expect(countActiveInvoiceFilters(parseInvoiceFilters(params('status=paid&sort=nonsense')))).toBe(1);
		expect(countActiveInvoiceFilters(parseInvoiceFilters(params('page=3&period=90d&saved=12')))).toBe(0);
	});
});

describe('invoiceFilterParams / invoiceFiltersHref', () => {
	it('omits empty filters and the default sort', () => {
		expect(invoiceFilterParams(EMPTY_INVOICE_FILTERS).toString()).toBe('');
		expect(invoiceFiltersHref(EMPTY_INVOICE_FILTERS)).toBe('/invoices');
		expect(invoiceFilterParams({ ...EMPTY_INVOICE_FILTERS, sort: DEFAULT_INVOICE_SORT }).toString()).toBe('');
	});

	it('round-trips every filter through the query string', () => {
		expect(parseInvoiceFilters(invoiceFilterParams(ALL))).toEqual(ALL);
	});

	it('carries period and page only when they are not the defaults', () => {
		expect(invoiceFiltersHref(EMPTY_INVOICE_FILTERS, { period: '30d', page: 1 })).toBe('/invoices');
		expect(invoiceFiltersHref(EMPTY_INVOICE_FILTERS, { period: '90d', page: 3 })).toBe('/invoices?period=90d&page=3');
	});

	it('resets pagination when a filter is present but no page is asked for', () => {
		expect(invoiceFiltersHref({ ...EMPTY_INVOICE_FILTERS, status: 'paid' })).toBe('/invoices?status=paid');
	});

	it('escapes values instead of splicing them into the URL', () => {
		const href = invoiceFiltersHref({ ...EMPTY_INVOICE_FILTERS, q: 'a&b=c d' });
		expect(href).toBe('/invoices?q=a%26b%3Dc+d');
		expect(parseInvoiceFilters(new URL(`https://x${href}`).searchParams).q).toBe('a&b=c d');
	});
});

describe('defaultFiltersOpen', () => {
	it('starts collapsed when nothing is filtered', () => {
		expect(defaultFiltersOpen(0)).toBe(false);
		expect(defaultFiltersOpen(countActiveInvoiceFilters(EMPTY_INVOICE_FILTERS))).toBe(false);
	});

	it('opens when the URL arrives with active filters, so they are visible and clearable', () => {
		expect(defaultFiltersOpen(1)).toBe(true);
		expect(defaultFiltersOpen(countActiveInvoiceFilters(ALL))).toBe(true);
	});
});
