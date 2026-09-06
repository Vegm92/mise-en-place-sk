/**
 * Issue #919 follow-up: when an invoice line prints no tax rate and the
 * lines on that invoice don't agree on a single rate either, the matched
 * product's own confirmed history can still settle it — but only when that
 * history is unanimous. previewLineProducts() surfaces this as
 * ProductMatch.suggestedTaxRate; disagreement (or no history) must stay null
 * rather than guess. DB-backed; skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { previewLineProducts, productTaxRateHistory } from '../src/lib/server/products';
import { normalizeProductKey } from '../src/lib/server/normalize';

let rid = '';

async function makeProduct(name: string): Promise<number> {
	const [row] = await testSql<Array<{ id: number }>>`
		INSERT INTO products (restaurant_id, canonical_name, name_key)
		VALUES (${rid}, ${name}, ${normalizeProductKey(name)})
		RETURNING id
	`;
	return row!.id;
}

async function confirmAlias(productId: number, rawText: string): Promise<void> {
	await testSql`
		INSERT INTO product_aliases (restaurant_id, product_id, raw_key, raw_text, source, original_source, confirmed_at)
		VALUES (${rid}, ${productId}, ${normalizeProductKey(rawText)}, ${rawText}, 'exact', 'exact', now())
	`;
}

async function confirmedLine(productId: number, taxRate: number): Promise<void> {
	await testSql`
		INSERT INTO invoice_line_items (restaurant_id, product_id, description, tax_rate)
		VALUES (${rid}, ${productId}, 'line', ${taxRate})
	`;
}

beforeAll(async () => {
	if (hasDbEnv) rid = (await createTestRestaurant('taxsug')).id;
});

afterAll(async () => {
	if (hasDbEnv) await cleanupTestRestaurant(rid);
	await closeDb();
});

const HISTORY_CASES = [
	{ label: 'every confirmed line for the product agrees', name: 'Aceite de Oliva', rates: [0.10, 0.10], expected: 0.10 },
	{ label: 'the confirmed history disagrees', name: 'Producto Mixto', rates: [0.21, 0.10], expected: null },
	{ label: 'the product has no confirmed lines', name: 'Producto Nuevo', rates: [], expected: null },
] as const;

describe.skipIf(!hasDbEnv)('productTaxRateHistory', () => {
	it.each(HISTORY_CASES)('resolves the rate when $label', async ({ name, rates, expected }) => {
		const productId = await makeProduct(name);
		for (const rate of rates) await confirmedLine(productId, rate);

		const history = await productTaxRateHistory(testDb, rid, [productId]);
		if (expected === null) {
			expect(history.has(productId)).toBe(false);
		} else {
			expect(history.get(productId)).toBeCloseTo(expected, 5);
		}
	});
});

const SUGGESTION_CASES = [
	{
		label: 'a matched product with a unanimous confirmed history',
		productName: 'Harina de Trigo', alias: 'HARINA TRIGO 25KG', rates: [0.04, 0.04],
		description: 'HARINA TRIGO 25KG', expectMatch: true, expectedRate: 0.04,
	},
	{
		label: 'a matched product with no confirmed history',
		productName: 'Sal Fina', alias: 'SAL FINA 1KG', rates: [],
		description: 'SAL FINA 1KG', expectMatch: true, expectedRate: null,
	},
	{
		label: 'an unmatched (new) line',
		productName: null, alias: null, rates: [],
		description: 'Producto que no existe', expectMatch: false, expectedRate: null,
	},
] as const;

describe.skipIf(!hasDbEnv)('previewLineProducts — suggestedTaxRate (issue #919 follow-up)', () => {
	it.each(SUGGESTION_CASES)('carries the suggestion for $label', async ({ productName, alias, rates, description, expectMatch, expectedRate }) => {
		let productId: number | null = null;
		if (productName) {
			productId = await makeProduct(productName);
			if (alias) await confirmAlias(productId, alias);
			for (const rate of rates) await confirmedLine(productId, rate);
		}

		const matches = await previewLineProducts(testDb, rid, null, [{ description }]);
		expect(matches[0]!.productId).toBe(expectMatch ? productId : null);
		if (expectedRate === null) {
			expect(matches[0]!.suggestedTaxRate).toBeNull();
		} else {
			expect(matches[0]!.suggestedTaxRate).toBeCloseTo(expectedRate, 5);
		}
	});
});
