import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const MOBILE_LIST = readFileSync(
	path.join(ROOT, 'src/lib/components/mobile/MobileInvoiceList.svelte'),
	'utf8',
);
const PAGE_SVELTE = readFileSync(
	path.join(ROOT, 'src/routes/(app)/invoices/+page.svelte'),
	'utf8',
);
const PAGE_SERVER = readFileSync(
	path.join(ROOT, 'src/routes/(app)/invoices/+page.server.ts'),
	'utf8',
);
const FILTERS_TS = readFileSync(path.join(ROOT, 'src/lib/invoice-filters.ts'), 'utf8');
const I18N = readFileSync(path.join(ROOT, 'src/lib/i18n.ts'), 'utf8');

describe('invoices mobile — server-backed filters (issue #655)', () => {
	it('drops the client-only filtered/activeFilter local state', () => {
		expect(MOBILE_LIST).not.toMatch(/activeFilter/);
		expect(MOBILE_LIST).not.toMatch(/const filtered = \$derived/);
	});

	it('accepts filters, suppliers, pagination, onFilter and onLoadMore as props', () => {
		expect(MOBILE_LIST).toMatch(/filters:\s*InvoiceFilters/);
		expect(MOBILE_LIST).toMatch(/suppliers:\s*Supplier\[\]/);
		expect(MOBILE_LIST).toMatch(/pagination:\s*Pagination/);
		expect(MOBILE_LIST).toMatch(/onFilter:\s*\(patch: Partial<InvoiceFilters>\) => void/);
		expect(MOBILE_LIST).toMatch(/onLoadMore:\s*\(\) => void/);
	});

	it('derives chip active state from the filters prop, not local state', () => {
		expect(MOBILE_LIST).toMatch(/filters\.status === 'pending'/);
		expect(MOBILE_LIST).toMatch(/filters\.status === 'overdue'/);
		expect(MOBILE_LIST).toMatch(/filters\.supplier_id \? 'active'/);
		expect(MOBILE_LIST).toMatch(/filters\.category \? 'active'/);
	});

	it('every chip calls onFilter or navigates, none are inert', () => {
		expect(MOBILE_LIST).toMatch(/onclick=\{toggleMonth\}/);
		expect(MOBILE_LIST).toMatch(/onFilter\(\{ status: filters\.status === value/);
		expect(MOBILE_LIST).toMatch(/href="\/invoices\/export"/);
	});

	it('offers supplier and category bottom sheets', () => {
		expect(MOBILE_LIST).toMatch(/supplierSheetOpen/);
		expect(MOBILE_LIST).toMatch(/categorySheetOpen/);
		expect(MOBILE_LIST.match(/class="filter-sheet"/g)?.length ?? 0).toBe(2);
	});

	it('renders a load-more control wired to onLoadMore, not a numeric pager', () => {
		expect(MOBILE_LIST).toMatch(/onclick=\{onLoadMore\}/);
		expect(MOBILE_LIST).not.toMatch(/ChevronLeft|ChevronRight/);
	});

	it('+page.svelte adds a multi-key patchFilters and a mobile load-more navigator', () => {
		expect(PAGE_SVELTE).toMatch(/function patchFilters\(patch: Partial<InvoiceFilters>\)/);
		expect(PAGE_SVELTE).toMatch(/function loadMoreMobile\(\)/);
		expect(PAGE_SVELTE).toMatch(/page: pagination\.page \+ 1/);
	});

	it('passes the server filter state down to MobileInvoiceList', () => {
		expect(PAGE_SVELTE).toMatch(/onFilter=\{patchFilters\}/);
		expect(PAGE_SVELTE).toMatch(/onLoadMore=\{loadMoreMobile\}/);
	});

	it('scopes the category predicate inside the tenant-scoped conditions array', () => {
		expect(PAGE_SERVER).toMatch(/if \(category\)\s+conditions\.push\(eq\(suppliers\.category, category\)\)/);
	});

	it('returns supplier category so the mobile sheet can group by it', () => {
		expect(PAGE_SERVER).toMatch(/category: suppliers\.category/);
	});

	it('adds a UTC currentMonthRange helper for the "Este mes" chip', () => {
		expect(FILTERS_TS).toMatch(/export function currentMonthRange/);
		expect(FILTERS_TS).toMatch(/getUTCFullYear|Date\.UTC/);
	});

	it('adds the new mobile-sheet i18n keys to both locales', () => {
		const keys = [
			'minv.sheet.supplierTitle',
			'minv.sheet.categoryTitle',
			'minv.sheet.close',
			'minv.sheet.allCategories',
			'minv.loadMore',
			'minv.showing',
		];
		for (const key of keys) {
			expect(I18N.match(new RegExp(`'${key.replace(/\./g, '\\.')}':`, 'g'))?.length ?? 0).toBe(2);
		}
	});
});
