/**
 * Issue #575 — the supplier detail "Productos" tab exposed only average price,
 * total quantity and last purchase date. It now also aggregates total spend
 * (SUM of line-item total price) and units purchased (SUM of line-item
 * quantity), and both mobile and desktop variants render them as columns.
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped without
 * a local Postgres (see tests/helpers/test-db.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { setLocale, t as tStore, loadAllMessages } from '../src/lib/i18n';

await loadAllMessages();

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

type ProductRow = {
	description: string | null;
	unit: string | null;
	avgPrice: number | null;
	totalQty: number | null;
	totalSpend: number | null;
	lastDate: string | null;
};

let rid = '';
let otherRid = '';
let supplierId = 0;
let otherSupplierId = 0;

async function insertSupplier(restaurantId: string, name: string): Promise<number> {
	const rows = await testSql`
		INSERT INTO suppliers (restaurant_id, name) VALUES (${restaurantId}, ${name}) RETURNING id
	`;
	return Number((rows[0] as { id: number }).id);
}

async function insertInvoice(
	restaurantId: string,
	supId: number,
	number: string,
	date: string,
	total: string,
	deleted = false,
): Promise<number> {
	const rows = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status, deleted_at)
		VALUES (${restaurantId}, ${supId}, ${number}, ${date}, ${total}, 'pending', ${deleted ? new Date().toISOString() : null})
		RETURNING id
	`;
	return Number((rows[0] as { id: number }).id);
}

async function insertLine(
	restaurantId: string,
	invoiceId: number,
	description: string,
	quantity: number,
	unit: string,
	unitPrice: string,
	totalPrice: string | null,
) {
	await testSql`
		INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, quantity, unit, unit_price, total_price)
		VALUES (${restaurantId}, ${invoiceId}, ${description}, ${quantity}, ${unit}, ${unitPrice}, ${totalPrice})
	`;
}

async function loadProducts(supId: number, restaurantId: string): Promise<ProductRow[]> {
	const { load } = await import('../src/routes/(app)/suppliers/[id]/+page.server');
	const event = {
		params: { id: String(supId) },
		locals: { restaurantId },
		url: new URL('http://localhost/suppliers/' + supId + '?tab=productos'),
	} as never;
	const out = await (load as unknown as (e: never) => Promise<{ products: ProductRow[] }>)(event);
	return out.products;
}

function product(products: ProductRow[], description: string): ProductRow {
	const row = products.find(p => p.description === description);
	if (!row) throw new Error(`product not loaded: ${description}`);
	return row;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('sup-prod-agg');
	rid = r.id;
	const other = await createTestRestaurant('sup-prod-agg-other');
	otherRid = other.id;

	supplierId = await insertSupplier(rid, '__sup_575_frutas__');
	otherSupplierId = await insertSupplier(otherRid, '__sup_575_frutas_other__');

	const inv1 = await insertInvoice(rid, supplierId, 'ALB-575-1', '2026-05-10', '150.00');
	await insertLine(rid, inv1, 'Tomate rama', 10, 'kg', '2.00', '20.00');
	await insertLine(rid, inv1, 'Aceite oliva', 2, 'garrafa', '30.00', '60.00');

	const inv2 = await insertInvoice(rid, supplierId, 'ALB-575-2', '2026-06-14', '95.50');
	await insertLine(rid, inv2, 'Tomate rama', 5, 'kg', '2.50', '12.50');
	await insertLine(rid, inv2, 'Aceite oliva', 1, 'garrafa', '33.00', '33.00');

	const deletedInv = await insertInvoice(rid, supplierId, 'ALB-575-DEL', '2026-06-20', '999.00', true);
	await insertLine(rid, deletedInv, 'Tomate rama', 1000, 'kg', '9.00', '9000.00');

	const otherInv = await insertInvoice(otherRid, otherSupplierId, 'ALB-575-X', '2026-06-21', '500.00');
	await insertLine(otherRid, otherInv, 'Tomate rama', 400, 'kg', '4.00', '1600.00');

	const noTotal = await insertInvoice(rid, supplierId, 'ALB-575-3', '2026-06-25', '10.00');
	await insertLine(rid, noTotal, 'Perejil', 4, 'manojo', '2.50', null);
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await cleanupTestRestaurant(otherRid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('supplier detail products aggregates (issue #575)', () => {
	it('exposes total spend as the sum of line-item total prices per product', async () => {
		const products = await loadProducts(supplierId, rid);
		expect(product(products, 'Tomate rama').totalSpend).toBeCloseTo(32.5, 2);
		expect(product(products, 'Aceite oliva').totalSpend).toBeCloseTo(93, 2);
	});

	it('exposes units purchased as the sum of line-item quantities per product', async () => {
		const products = await loadProducts(supplierId, rid);
		expect(product(products, 'Tomate rama').totalQty).toBeCloseTo(15, 5);
		expect(product(products, 'Aceite oliva').totalQty).toBeCloseTo(3, 5);
	});

	it('excludes soft-deleted invoices from both aggregates', async () => {
		const products = await loadProducts(supplierId, rid);
		const tomato = product(products, 'Tomate rama');
		expect(tomato.totalSpend).toBeLessThan(9000);
		expect(tomato.totalQty).toBeLessThan(1000);
	});

	it('never leaks another tenant/supplier line items into the aggregates', async () => {
		const products = await loadProducts(supplierId, rid);
		expect(product(products, 'Tomate rama').totalSpend).toBeCloseTo(32.5, 2);

		const otherProducts = await loadProducts(otherSupplierId, otherRid);
		expect(product(otherProducts, 'Tomate rama').totalSpend).toBeCloseTo(1600, 2);
		expect(product(otherProducts, 'Tomate rama').totalQty).toBeCloseTo(400, 5);
	});

	it('returns null total spend (not 0) when no line has a total price, keeping units', async () => {
		const products = await loadProducts(supplierId, rid);
		const parsley = product(products, 'Perejil');
		expect(parsley.totalSpend).toBeNull();
		expect(parsley.totalQty).toBeCloseTo(4, 5);
	});

	it('returns aggregates as JS numbers, never numeric strings', async () => {
		const products = await loadProducts(supplierId, rid);
		const tomato = product(products, 'Tomate rama');
		expect(typeof tomato.totalSpend).toBe('number');
		expect(typeof tomato.totalQty).toBe('number');
	});
});

describe('supplier products table columns (issue #575)', () => {
	const desktop = readFileSync(
		new URL('../src/lib/components/desktop/DesktopSupplierDetail.svelte', import.meta.url),
		'utf-8',
	);
	const mobile = readFileSync(
		new URL('../src/routes/(app)/suppliers/[id]/+page.svelte', import.meta.url),
		'utf-8',
	);

	it('renders a total-spend column in the desktop products table', () => {
		expect(desktop).toContain("t('sup.products.colSpend')");
		expect(desktop).toContain('p.totalSpend');
	});

	it('renders a units-purchased column in the desktop products table', () => {
		expect(desktop).toContain("t('sup.products.colUnits')");
		expect(desktop).toContain('p.totalQty');
	});

	it('renders both aggregates in the mobile products list too (ADR-020)', () => {
		expect(mobile).toContain("t('sup.products.colSpend')");
		expect(mobile).toContain("t('sup.products.colUnits')");
		expect(mobile).toContain('prod.totalSpend');
		expect(mobile).toContain('prod.totalQty');
	});
});

describe('supplier products column labels (issue #575)', () => {
	it('labels both columns in Spanish', () => {
		setLocale('es');
		const t = tStore;
		expect(t('sup.products.colSpend')).toBe('Gasto total');
		expect(t('sup.products.colUnits')).toBe('Unidades compradas');
	});

	it('labels both columns in English', () => {
		setLocale('en');
		const t = tStore;
		expect(t('sup.products.colSpend')).toBe('Total spend');
		expect(t('sup.products.colUnits')).toBe('Units purchased');
		setLocale('es');
	});
});
