/**
 * Product catalog sort state (issue #884): parsing the `sort` query param and
 * the server-side comparator for `yoy_desc` (largest year-over-year price
 * move first, regardless of direction).
 */
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_PRODUCT_SORT,
	PRODUCT_SORT_KEYS,
	isProductSortKey,
	parseProductSort,
	productSortHref,
	sortProducts,
	type YoySortable,
} from '../src/lib/product-filters';

describe('isProductSortKey', () => {
	it('accepts every declared sort key', () => {
		for (const key of PRODUCT_SORT_KEYS) expect(isProductSortKey(key)).toBe(true);
	});

	it('rejects garbage', () => {
		expect(isProductSortKey('')).toBe(false);
		expect(isProductSortKey('price_desc')).toBe(false);
		expect(isProductSortKey('YOY_DESC')).toBe(false);
		expect(isProductSortKey('name; DROP TABLE products')).toBe(false);
	});
});

describe('parseProductSort', () => {
	it('defaults to name when sort is absent', () => {
		expect(parseProductSort(new URLSearchParams(''))).toBe(DEFAULT_PRODUCT_SORT);
	});

	it('falls back to the default for an unknown value', () => {
		expect(parseProductSort(new URLSearchParams('sort=bogus'))).toBe(DEFAULT_PRODUCT_SORT);
	});

	it('accepts a known sort key', () => {
		expect(parseProductSort(new URLSearchParams('sort=yoy_desc'))).toBe('yoy_desc');
	});
});

describe('sortProducts', () => {
	const products: (YoySortable & { name: string })[] = [
		{ name: 'a', yoyChangePct: 5 },
		{ name: 'b', yoyChangePct: -40 },
		{ name: 'c', yoyChangePct: null },
		{ name: 'd', yoyChangePct: 12 },
	];

	it('leaves the input order untouched for the default sort', () => {
		expect(sortProducts(products, 'name').map(p => p.name)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('orders by the largest absolute change first for yoy_desc, nulls last', () => {
		expect(sortProducts(products, 'yoy_desc').map(p => p.name)).toEqual(['b', 'd', 'a', 'c']);
	});

	it('does not mutate the input array', () => {
		const copy = [...products];
		sortProducts(products, 'yoy_desc');
		expect(products).toEqual(copy);
	});
});

describe('productSortHref', () => {
	it('drops the sort param for the default sort', () => {
		expect(productSortHref('name', new URLSearchParams('sort=yoy_desc&period=1y'))).toBe('/products?period=1y');
	});

	it('sets the sort param for a non-default sort', () => {
		expect(productSortHref('yoy_desc', new URLSearchParams(''))).toBe('/products?sort=yoy_desc');
	});
});
