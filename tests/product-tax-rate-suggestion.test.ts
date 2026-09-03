/**
 * Issue #919 follow-up: when an invoice line prints no tax rate and the
 * lines on that invoice don't agree on a single rate either, the matched
 * product's own confirmed history can still settle it — but only when that
 * history is unanimous. previewLineProducts() surfaces this as
 * ProductMatch.suggestedTaxRate; disagreement (or no history) must stay null
 * rather than guess. DB-backed; skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { previewLineProducts, productTaxRateHistory } from '../src/lib/server/products';
import { normalizeProductKey } from '../src/lib/server/normalize';

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

let rid = '';

async function makeProduct(name: string): Promise<number> {
	const [row] = await testSql<Array<{ id: number }>>`
		INSERT INTO products (restaurant_id, canonical_name, name_key)
		VALUES (${rid}, ${name}, ${normalizeProductKey(name)})
		RETURNING id
	`;
	return row.id;
}

async function confirmAlias(productId: number, rawText: string): Promise<void> {
	await testSql`
		INSERT INTO product_aliases (restaurant_id, product_id, raw_key, raw_text, source, original_source, confirmed_at)
		VALUES (${rid}, ${productId}, ${normalizeProductKey(rawText)}, ${rawText}, 'exact', 'exact', now())
	`;
}

async function confirmedLine(productId: number, taxRate: number | null): Promise<void> {
	await testSql`
		INSERT INTO invoice_line_items (restaurant_id, product_id, description, tax_rate)
		VALUES (${rid}, ${productId}, 'line', ${taxRate})
	`;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('taxsug');
	rid = r.id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM invoice_line_items WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM product_aliases WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM products WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('productTaxRateHistory', () => {
	it('returns the rate when every confirmed line for the product agrees', async () => {
		const productId = await makeProduct('Aceite de Oliva');
		await confirmedLine(productId, 0.10);
		await confirmedLine(productId, 0.10);

		const history = await productTaxRateHistory(testDb, rid, [productId]);
		expect(history.get(productId)).toBeCloseTo(0.10, 5);
	});

	it('omits the product when its confirmed history disagrees', async () => {
		const productId = await makeProduct('Producto Mixto');
		await confirmedLine(productId, 0.21);
		await confirmedLine(productId, 0.10);

		const history = await productTaxRateHistory(testDb, rid, [productId]);
		expect(history.has(productId)).toBe(false);
	});

	it('omits a product with no confirmed lines', async () => {
		const productId = await makeProduct('Producto Nuevo');
		const history = await productTaxRateHistory(testDb, rid, [productId]);
		expect(history.has(productId)).toBe(false);
	});
});

describe.skipIf(!hasDbEnv)('previewLineProducts — suggestedTaxRate (issue #919 follow-up)', () => {
	it('carries the unanimous historical rate onto the match', async () => {
		const productId = await makeProduct('Harina de Trigo');
		await confirmAlias(productId, 'HARINA TRIGO 25KG');
		await confirmedLine(productId, 0.04);
		await confirmedLine(productId, 0.04);

		const matches = await previewLineProducts(testDb, rid, null, [{ description: 'HARINA TRIGO 25KG' }]);
		expect(matches[0].productId).toBe(productId);
		expect(matches[0].suggestedTaxRate).toBeCloseTo(0.04, 5);
	});

	it('leaves suggestedTaxRate null when the product has no confirmed history', async () => {
		const productId = await makeProduct('Sal Fina');
		await confirmAlias(productId, 'SAL FINA 1KG');

		const matches = await previewLineProducts(testDb, rid, null, [{ description: 'SAL FINA 1KG' }]);
		expect(matches[0].productId).toBe(productId);
		expect(matches[0].suggestedTaxRate).toBeNull();
	});

	it('leaves suggestedTaxRate null for an unmatched (new) line', async () => {
		const matches = await previewLineProducts(testDb, rid, null, [{ description: 'Producto que no existe' }]);
		expect(matches[0].productId).toBeNull();
		expect(matches[0].suggestedTaxRate).toBeNull();
	});
});
