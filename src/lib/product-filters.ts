export const PRODUCT_SORT_KEYS = ['name', 'yoy_desc'] as const;

export type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number];

export const DEFAULT_PRODUCT_SORT: ProductSortKey = 'name';

export function isProductSortKey(value: string): value is ProductSortKey {
	return (PRODUCT_SORT_KEYS as readonly string[]).includes(value);
}

export function parseProductSort(params: URLSearchParams): ProductSortKey {
	const sort = (params.get('sort') ?? '').trim();
	return isProductSortKey(sort) ? sort : DEFAULT_PRODUCT_SORT;
}

export interface YoySortable {
	yoyChangePct: number | null;
}

export function sortProductsByYoy<T extends YoySortable>(products: T[]): T[] {
	return [...products].sort((a, b) => {
		if (a.yoyChangePct == null && b.yoyChangePct == null) return 0;
		if (a.yoyChangePct == null) return 1;
		if (b.yoyChangePct == null) return -1;
		return Math.abs(b.yoyChangePct) - Math.abs(a.yoyChangePct);
	});
}

export function sortProducts<T extends YoySortable>(products: T[], sort: ProductSortKey): T[] {
	return sort === 'yoy_desc' ? sortProductsByYoy(products) : products;
}

export function productSortHref(sort: ProductSortKey, currentParams: URLSearchParams): string {
	const params = new URLSearchParams(currentParams);
	if (sort === DEFAULT_PRODUCT_SORT) params.delete('sort');
	else params.set('sort', sort);
	const qs = params.toString();
	return qs ? `/products?${qs}` : '/products';
}
