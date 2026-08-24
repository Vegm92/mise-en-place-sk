import { VALID_CATEGORIES } from './constants';

export const SUPPLIER_SORT_KEYS = [
	'spend_desc',
	'spend_asc',
	'name_asc',
	'name_desc',
	'last_invoice_desc',
	'last_invoice_asc',
	'reliability_desc',
	'reliability_asc',
] as const;

export type SupplierSortKey = (typeof SUPPLIER_SORT_KEYS)[number];

export const DEFAULT_SUPPLIER_SORT: SupplierSortKey = 'spend_desc';

export const SUPPLIER_SEARCH_DEBOUNCE_MS = 300;

export const SUPPLIER_SORT_LABEL_KEYS: Record<SupplierSortKey, string> = {
	spend_desc: 'sup.sort.spendDesc',
	spend_asc: 'sup.sort.spendAsc',
	name_asc: 'sup.sort.nameAsc',
	name_desc: 'sup.sort.nameDesc',
	last_invoice_desc: 'sup.sort.lastInvoiceDesc',
	last_invoice_asc: 'sup.sort.lastInvoiceAsc',
	reliability_desc: 'sup.sort.reliabilityDesc',
	reliability_asc: 'sup.sort.reliabilityAsc',
};

export interface SupplierListParams {
	sort: SupplierSortKey;
	search: string;
	category: string;
	uncategorizedOnly: boolean;
}

const SORT_KEY_SET = new Set<string>(SUPPLIER_SORT_KEYS);
const CATEGORY_SET = new Set<string>(VALID_CATEGORIES);

export function isSupplierSortKey(value: unknown): value is SupplierSortKey {
	return typeof value === 'string' && SORT_KEY_SET.has(value);
}

export function parseSupplierListParams(params: URLSearchParams): SupplierListParams {
	const rawSort = params.get('sort');
	const rawCategory = (params.get('category') ?? '').trim();
	return {
		sort: isSupplierSortKey(rawSort) ? rawSort : DEFAULT_SUPPLIER_SORT,
		search: (params.get('q') ?? '').trim(),
		category: CATEGORY_SET.has(rawCategory) ? rawCategory : '',
		uncategorizedOnly: params.get('uncategorized') === '1',
	};
}

export function supplierListQueryString(params: Partial<SupplierListParams>): string {
	const out = new URLSearchParams();
	if (params.sort && params.sort !== DEFAULT_SUPPLIER_SORT) out.set('sort', params.sort);
	if (params.search) out.set('q', params.search);
	if (params.category) out.set('category', params.category);
	if (params.uncategorizedOnly) out.set('uncategorized', '1');
	return out.toString();
}
