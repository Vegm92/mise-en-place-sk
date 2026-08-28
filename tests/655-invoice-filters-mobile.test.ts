/**
 * Mobile invoice list controls (issue #655).
 *
 * The mobile chip strip must drive the same server-side filter params the
 * desktop toolbar uses — a chip that only narrows the already-paginated page-1
 * array (or does nothing at all) lies about the result set. These tests pin
 * the properties the fix creates: chips route through $lib/invoice-filters,
 * supplier/category sheets exist, "Este mes" is a real date filter, a
 * server-driven "Cargar más" pager exists, the export link is reachable on
 * mobile, and no client-only status filtering remains.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	EMPTY_INVOICE_FILTERS,
	currentMonthRange,
	invoiceFilterParams,
	parseInvoiceFilters,
} from '../src/lib/invoice-filters';

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8');
const MOB = read('../src/lib/components/mobile/MobileInvoiceList.svelte');
const PAGE = read('../src/routes/(app)/invoices/+page.svelte');
const SERVER = read('../src/routes/(app)/invoices/+page.server.ts');

describe('mobile chips drive server filter params', () => {
	it('imports the shared invoice-filters module instead of filtering client-side', () => {
		expect(MOB).toMatch(/\$lib\/invoice-filters/);
	});

	it('keeps no client-only status filtering over the loaded page', () => {
		expect(MOB).not.toMatch(/invoices\s*;?\s*$[\s\S]*?\.filter\(\s*inv\s*=>/m);
		expect(MOB).not.toMatch(/activeFilter\s*=\s*f\.id/);
		expect(MOB).not.toMatch(/let\s+activeFilter\s*=\s*\$state/);
	});

	it('derives chip active state from the applied server filters', () => {
		expect(MOB).toMatch(/filters\.status\s*===\s*'por_revisar'/);
		expect(MOB).toMatch(/filters\.status\s*===\s*'incidencia'/);
	});

	it('makes "Este mes" a real date filter through date_from/date_to', () => {
		expect(MOB).toMatch(/currentMonthRange/);
		expect(MOB).toMatch(/date_from/);
		expect(MOB).toMatch(/date_to/);
	});

	it('opens supplier and category sheets that apply server filters', () => {
		expect(MOB).toMatch(/role="dialog"/);
		expect(MOB).toMatch(/filter-sheet-option/);
		expect(MOB).toMatch(/supplier_id/);
		expect(MOB).toMatch(/category/);
	});
});

describe('mobile pagination and export', () => {
	it('renders a Cargar más control fed by server pagination', () => {
		expect(MOB).toMatch(/minv\.loadMore/);
		expect(MOB).toMatch(/pagination/);
	});

	it('keeps the export link reachable on mobile', () => {
		expect(MOB).toMatch(/href="\/invoices\/export"/);
	});

	it('page wires filters, suppliers and pagination into the mobile list', () => {
		const mobileBlock = PAGE.match(/<MobileInvoiceList[\s\S]*?\/>/)?.[0] ?? '';
		expect(mobileBlock).toMatch(/filters=/);
		expect(mobileBlock).toMatch(/suppliers=/);
		expect(mobileBlock).toMatch(/pagination=/);
	});
});

describe('category server filter (new param for the mobile sheet)', () => {
	it('round-trips category through parse and params', () => {
		const filters = { ...EMPTY_INVOICE_FILTERS, category: 'Lácteos' };
		const qs = invoiceFilterParams(filters);
		expect(qs.get('category')).toBe('Lácteos');
		expect(parseInvoiceFilters(qs)).toEqual(filters);
	});

	it('filters invoices by supplier category in the load query', () => {
		expect(SERVER).toMatch(/category.*suppliers\.category|suppliers\.category.*category/);
	});
});

describe('currentMonthRange', () => {
	it('returns the first and last day of the month in ISO', () => {
		expect(currentMonthRange(new Date('2026-08-25T10:00:00Z'))).toEqual({
			from: '2026-08-01',
			to: '2026-08-31',
		});
	});

	it('handles February and December edges', () => {
		expect(currentMonthRange(new Date('2024-02-10T00:00:00Z'))).toEqual({ from: '2024-02-01', to: '2024-02-29' });
		expect(currentMonthRange(new Date('2026-12-31T23:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
	});
});
