/**
 * Supplier list — server-side sorting and filtering (issue #580).
 *
 * The list used to be sorted by a single hardcoded ORDER BY and filtered in the
 * browser, so nothing survived a reload or a shared link. These tests pin the
 * contract of the new URL-driven, server-side query:
 *
 *   - parseSupplierListParams() validates every search param, so an unknown
 *     (or hostile) sort key can never reach SQL
 *   - each sort option returns the correct ORDER against seeded data
 *   - each filter narrows the list correctly
 *   - results stay scoped to locals.restaurantId — a second restaurant's
 *     suppliers never leak in, whatever the sort/filter combination
 *   - both UI variants (mobile + desktop, ADR-020) drive the same params
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	testSql,
	closeDb,
	createTestRestaurant,
	cleanupTestRestaurant,
	hasDbEnv,
} from './helpers/test-db';
import {
	SUPPLIER_SORT_KEYS,
	DEFAULT_SUPPLIER_SORT,
	SUPPLIER_SORT_LABEL_KEYS,
	SUPPLIER_SEARCH_DEBOUNCE_MS,
	parseSupplierListParams,
	type SupplierSortKey,
} from '../src/lib/supplier-list';
import { translations } from '../src/lib/i18n-messages';
import { VALID_CATEGORIES } from '../src/lib/constants';

// ── Param parsing (pure — runs without a database) ────────────────────────────

describe('parseSupplierListParams', () => {
	const parse = (qs: string) => parseSupplierListParams(new URLSearchParams(qs), VALID_CATEGORIES);

	it('offers at least four sort options covering name, spend, last invoice and reliability', () => {
		expect(SUPPLIER_SORT_KEYS.length).toBeGreaterThanOrEqual(4);
		for (const key of ['name_asc', 'name_desc', 'spend_desc', 'last_invoice_desc', 'reliability_desc']) {
			expect(SUPPLIER_SORT_KEYS).toContain(key);
		}
	});

	it('keeps a known sort key', () => {
		for (const key of SUPPLIER_SORT_KEYS) {
			expect(parse(`sort=${encodeURIComponent(key)}`).sort).toBe(key);
		}
	});

	it('falls back to the default sort for an unknown or hostile key', () => {
		expect(parse('sort=name').sort).toBe(DEFAULT_SUPPLIER_SORT);
		expect(parse('sort=').sort).toBe(DEFAULT_SUPPLIER_SORT);
		expect(parse('').sort).toBe(DEFAULT_SUPPLIER_SORT);
		expect(parse('sort=' + encodeURIComponent('name; DROP TABLE suppliers--')).sort)
			.toBe(DEFAULT_SUPPLIER_SORT);
		expect(parse('sort=' + encodeURIComponent("name ASC; DELETE FROM suppliers")).sort)
			.toBe(DEFAULT_SUPPLIER_SORT);
		expect(SUPPLIER_SORT_KEYS).toContain(DEFAULT_SUPPLIER_SORT);
	});

	it('trims the search term and treats blank as absent', () => {
		expect(parse('q=%20%20alfa%20%20').search).toBe('alfa');
		expect(parse('q=%20%20').search).toBe('');
		expect(parse('').search).toBe('');
	});

	it('keeps a valid category and drops an unknown one', () => {
		expect(parse('category=' + encodeURIComponent('Bebidas')).category).toBe('Bebidas');
		expect(parse('category=' + encodeURIComponent("' OR 1=1--")).category).toBe('');
		expect(parse('').category).toBe('');
	});

	it('reads the uncategorized-products toggle', () => {
		expect(parse('uncategorized=1').uncategorizedOnly).toBe(true);
		expect(parse('uncategorized=0').uncategorizedOnly).toBe(false);
		expect(parse('').uncategorizedOnly).toBe(false);
	});

	it('gives every sort option a bilingual label', () => {
		for (const key of SUPPLIER_SORT_KEYS) {
			const labelKey = SUPPLIER_SORT_LABEL_KEYS[key];
			expect(labelKey).toBeTruthy();
			expect((translations.es as Record<string, string>)[labelKey]).toBeTruthy();
			expect((translations.en as Record<string, string>)[labelKey]).toBeTruthy();
		}
	});

	it('debounces the text search', () => {
		expect(SUPPLIER_SEARCH_DEBOUNCE_MS).toBeGreaterThan(0);
	});
});

// ── UI variants (ADR-020: mobile and desktop are both rendered) ───────────────

describe('supplier list controls exist in both UI variants', () => {
	const desktop = readFileSync('src/routes/(app)/suppliers/+page.svelte', 'utf-8');
	const mobile = readFileSync('src/lib/components/mobile/MobileSuppliersList.svelte', 'utf-8');

	it('desktop renders the sort dropdown, category dropdown and uncategorized toggle', () => {
		expect(desktop).toContain('SUPPLIER_SORT_KEYS');
		expect(desktop).toContain('sup.sort.label');
		expect(desktop).toContain('sup.filterAllCategories');
		expect(desktop).toContain('sup.filterUncategorized');
	});

	it('mobile renders the same controls', () => {
		expect(mobile).toContain('SUPPLIER_SORT_KEYS');
		expect(mobile).toContain('sup.sort.label');
		expect(mobile).toContain('sup.filterUncategorized');
	});

	it('neither variant re-filters the list in the browser — both render the server list as-is', () => {
		expect(desktop).not.toMatch(/const filtered\s*=/);
		expect(mobile).not.toMatch(/const filtered\s*=/);
		expect(desktop).toContain('{#each data.suppliers as s');
		expect(mobile).toContain('{#each suppliers as s}');
	});
});

// ── Server-side sorting and filtering (DB-backed) ─────────────────────────────

let ridA = '';
let ridB = '';
const supplierIds: Record<string, number> = {};

type SupplierRow = {
	id: number;
	name: string;
	category: string | null;
	total_spend: number;
	last_invoice_date: string | null;
	reliability_score: number | null;
};

type LoadResult = {
	suppliers: SupplierRow[];
	categories: string[];
	categoryCounts: Record<string, number>;
	sort: SupplierSortKey;
	search: string;
	category: string;
	uncategorizedOnly: boolean;
};

async function loadSuppliers(rid: string, qs: string): Promise<LoadResult> {
	const { load } = await import('../src/routes/(app)/suppliers/+page.server');
	return (await load({
		url: new URL(`http://localhost/suppliers?${qs}`),
		locals: { restaurantId: rid },
	} as never)) as unknown as LoadResult;
}

const names = (r: LoadResult) => r.suppliers.map((s) => s.name);

async function seedSupplier(
	rid: string,
	name: string,
	category: string,
	invoiceRows: Array<[string, number]>,
	score: number | null,
) {
	const [s] = await testSql`
		INSERT INTO suppliers (restaurant_id, name, category)
		VALUES (${rid}, ${name}, ${category}) RETURNING id
	`;
	const supplierId = Number(s!.id);
	const invoiceIds: number[] = [];
	for (const [invoiceDate, amount] of invoiceRows) {
		const [inv] = await testSql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_date, total_amount, status)
			VALUES (${rid}, ${supplierId}, ${invoiceDate}, ${amount}, 'paid') RETURNING id
		`;
		invoiceIds.push(Number(inv!.id));
	}
	if (score !== null) {
		await testSql`
			INSERT INTO supplier_metrics
				(restaurant_id, supplier_id, score, price_stability_score, frequency_score, timeliness_score, computed_at)
			VALUES (${rid}, ${supplierId}, ${score}, 20, 15, 17, NOW())
		`;
	}
	supplierIds[name] = supplierId;
	return { supplierId, invoiceIds };
}

async function linkProduct(rid: string, invoiceId: number, productName: string, category: string) {
	const [p] = await testSql`
		INSERT INTO products (restaurant_id, canonical_name, name_key, category)
		VALUES (${rid}, ${productName}, ${productName.toLowerCase()}, ${category}) RETURNING id
	`;
	await testSql`
		INSERT INTO invoice_line_items (restaurant_id, invoice_id, product_id, description, unit_price)
		VALUES (${rid}, ${invoiceId}, ${Number(p!.id)}, ${productName}, 10.00)
	`;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	ridA = (await createTestRestaurant('sup-list-a')).id;
	ridB = (await createTestRestaurant('sup-list-b')).id;

	const alfa = await seedSupplier(ridA, 'Alfa Pescados', 'Pescados y Mariscos', [
		['2026-01-10', 100], ['2026-02-10', 200], ['2026-03-10', 300],
	], 40);

	const beta = await seedSupplier(ridA, 'Beta Verduras', 'Frutas y Verduras', [
		['2026-04-01', 10], ['2026-04-15', 10], ['2026-05-01', 30],
	], 90);

	await seedSupplier(ridA, 'Gamma Suministros', 'Bebidas', [
		['2026-02-01', 400], ['2026-02-05', 400], ['2026-02-09', 400],
	], 65);

	await linkProduct(ridA, alfa.invoiceIds[0]!, 'Merluza', 'Other');
	await linkProduct(ridA, beta.invoiceIds[0]!, 'Tomate', 'Frutas y Verduras');

	await seedSupplier(ridB, 'Alfa Pescados Ajeno', 'Pescados y Mariscos', [
		['2026-06-01', 99999], ['2026-06-02', 99999], ['2026-06-03', 99999],
	], 100);
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(ridA);
	await cleanupTestRestaurant(ridB);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('suppliers load() — sorting', () => {
	it('sorts by name A-Z and Z-A', async () => {
		expect(names(await loadSuppliers(ridA, 'sort=name_asc')))
			.toEqual(['Alfa Pescados', 'Beta Verduras', 'Gamma Suministros']);
		expect(names(await loadSuppliers(ridA, 'sort=name_desc')))
			.toEqual(['Gamma Suministros', 'Beta Verduras', 'Alfa Pescados']);
	});

	it('sorts by total spend, highest and lowest first', async () => {
		const desc = await loadSuppliers(ridA, 'sort=spend_desc');
		expect(names(desc)).toEqual(['Gamma Suministros', 'Alfa Pescados', 'Beta Verduras']);
		expect(desc.suppliers.map((s) => s.total_spend)).toEqual([1200, 600, 50]);

		expect(names(await loadSuppliers(ridA, 'sort=spend_asc')))
			.toEqual(['Beta Verduras', 'Alfa Pescados', 'Gamma Suministros']);
	});

	it('sorts by last invoice date, newest and oldest first', async () => {
		const desc = await loadSuppliers(ridA, 'sort=last_invoice_desc');
		expect(names(desc)).toEqual(['Beta Verduras', 'Alfa Pescados', 'Gamma Suministros']);
		expect(desc.suppliers.map((s) => s.last_invoice_date)).toEqual(
			['2026-05-01', '2026-03-10', '2026-02-09'],
		);

		expect(names(await loadSuppliers(ridA, 'sort=last_invoice_asc')))
			.toEqual(['Gamma Suministros', 'Alfa Pescados', 'Beta Verduras']);
	});

	it('sorts by reliability score, highest and lowest first', async () => {
		const desc = await loadSuppliers(ridA, 'sort=reliability_desc');
		expect(names(desc)).toEqual(['Beta Verduras', 'Gamma Suministros', 'Alfa Pescados']);
		expect(desc.suppliers.map((s) => s.reliability_score)).toEqual([90, 65, 40]);

		expect(names(await loadSuppliers(ridA, 'sort=reliability_asc')))
			.toEqual(['Alfa Pescados', 'Gamma Suministros', 'Beta Verduras']);
	});

	it('falls back to the default order for an unknown sort param without touching SQL', async () => {
		const hostile = await loadSuppliers(
			ridA,
			'sort=' + encodeURIComponent("name ASC; DROP TABLE suppliers--"),
		);
		expect(hostile.sort).toBe(DEFAULT_SUPPLIER_SORT);
		expect(names(hostile)).toEqual(names(await loadSuppliers(ridA, `sort=${DEFAULT_SUPPLIER_SORT}`)));

		const [_r_] = await testSql`SELECT COUNT(*)::int AS count FROM suppliers WHERE restaurant_id = ${ridA}`;

		const { count } = _r_!;
		expect(Number(count)).toBe(3);
	});
});

describe.skipIf(!hasDbEnv)('suppliers load() — filtering', () => {
	it('narrows by a case-insensitive text search on the supplier name', async () => {
		expect(names(await loadSuppliers(ridA, 'q=alfa'))).toEqual(['Alfa Pescados']);
		expect(names(await loadSuppliers(ridA, 'q=ALFA'))).toEqual(['Alfa Pescados']);
		expect(names(await loadSuppliers(ridA, 'q=verdur'))).toEqual(['Beta Verduras']);
		expect(names(await loadSuppliers(ridA, 'q=zzzz'))).toEqual([]);
	});

	it('also matches the category through the text search', async () => {
		expect(names(await loadSuppliers(ridA, 'q=bebidas'))).toEqual(['Gamma Suministros']);
	});

	it('treats LIKE wildcards in the search term as literal characters', async () => {
		expect(names(await loadSuppliers(ridA, 'q=%25'))).toEqual([]);
		expect(names(await loadSuppliers(ridA, 'q=_'))).toEqual([]);
	});

	it('narrows by category and ignores an unknown category', async () => {
		expect(names(await loadSuppliers(ridA, 'category=' + encodeURIComponent('Bebidas'))))
			.toEqual(['Gamma Suministros']);
		expect(names(await loadSuppliers(ridA, 'category=' + encodeURIComponent('Frutas y Verduras'))))
			.toEqual(['Beta Verduras']);
		expect(names(await loadSuppliers(ridA, 'category=' + encodeURIComponent("' OR 1=1--"))))
			.toHaveLength(3);
	});

	it('narrows to suppliers that have uncategorized products', async () => {
		expect(names(await loadSuppliers(ridA, 'uncategorized=1&sort=name_asc')))
			.toEqual(['Alfa Pescados']);
		expect(names(await loadSuppliers(ridA, 'uncategorized=0&sort=name_asc'))).toHaveLength(3);
	});

	it('combines filters with a sort', async () => {
		const res = await loadSuppliers(
			ridA,
			'q=a&sort=name_desc&category=' + encodeURIComponent('Pescados y Mariscos'),
		);
		expect(names(res)).toEqual(['Alfa Pescados']);
	});

	it('echoes the applied state back so the URL can be rebuilt', async () => {
		const res = await loadSuppliers(
			ridA,
			'q=%20alfa%20&sort=name_desc&uncategorized=1&category=' + encodeURIComponent('Bebidas'),
		);
		expect(res.sort).toBe('name_desc');
		expect(res.search).toBe('alfa');
		expect(res.category).toBe('Bebidas');
		expect(res.uncategorizedOnly).toBe(true);
	});
});

describe.skipIf(!hasDbEnv)('suppliers load() — tenant scoping', () => {
	it('never returns another restaurant\'s suppliers, for any sort', async () => {
		for (const sort of SUPPLIER_SORT_KEYS) {
			const res = await loadSuppliers(ridA, `sort=${sort}`);
			expect(names(res)).toHaveLength(3);
			expect(names(res)).not.toContain('Alfa Pescados Ajeno');
			expect(res.suppliers.map((s) => s.id)).not.toContain(supplierIds['Alfa Pescados Ajeno']);
		}
	});

	it('does not leak a foreign supplier through the text search', async () => {
		const res = await loadSuppliers(ridA, 'q=alfa');
		expect(names(res)).toEqual(['Alfa Pescados']);
	});

	it('serves the other restaurant only its own supplier', async () => {
		const res = await loadSuppliers(ridB, 'sort=name_asc');
		expect(names(res)).toEqual(['Alfa Pescados Ajeno']);
	});
});

describe.skipIf(!hasDbEnv)('suppliers load() — category chip order (issue #658)', () => {
	it('puts the categories this tenant actually buys from first', async () => {
		const res = await loadSuppliers(ridA, '');
		const used = ['Pescados y Mariscos', 'Frutas y Verduras', 'Bebidas'];
		expect(res.categories.slice(0, used.length).sort()).toEqual([...used].sort());
		expect(res.categories).toHaveLength(VALID_CATEGORIES.length);
	});

	it('counts suppliers per category without counting another tenant\'s', async () => {
		const res = await loadSuppliers(ridA, '');
		expect(res.categoryCounts['Pescados y Mariscos']).toBe(1);
		expect(res.categoryCounts['Frutas y Verduras']).toBe(1);
		expect(res.categoryCounts['Bebidas']).toBe(1);
		expect(res.categoryCounts['Congelados']).toBeUndefined();

		const other = await loadSuppliers(ridB, '');
		expect(other.categoryCounts['Pescados y Mariscos']).toBe(1);
		expect(other.categories[0]).toBe('Pescados y Mariscos');
	});

	it('keeps the order stable when a filter narrows the list', async () => {
		const unfiltered = await loadSuppliers(ridA, '');
		const filtered = await loadSuppliers(ridA, 'q=alfa');
		expect(filtered.categories).toEqual(unfiltered.categories);
	});
});
