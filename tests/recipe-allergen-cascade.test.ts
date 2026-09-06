import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { hasDbEnv, testSql, createTestRestaurant, cleanupTestRestaurant, closeDb } from './helpers/test-db';
import { applyExtractedAllergens } from '../src/lib/server/products';
import { extractedAllergensByKey } from '../src/lib/server/invoice-save';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const EXTRACTION_SRC = readFileSync(
	path.resolve(__dirname, '../src/lib/server/extract.ts'), 'utf8'
);

describe('the extraction prompt forbids inferring allergens', () => {
	it('lists the fourteen codes and refuses inference from the product name', () => {
		expect(EXTRACTION_SRC).toContain('"allergens"');
		expect(EXTRACTION_SRC).toContain('NEVER infer them from the product name');
		for (const code of ['gluten', 'crustaceos', 'moluscos', 'altramuces']) {
			expect(EXTRACTION_SRC).toContain(code);
		}
	});
});

describe('extractedAllergensByKey', () => {
	it('keys hints by the normalized description and drops empty ones', () => {
		const map = extractedAllergensByKey({
			line_items: [
				{ description: '  MERLUZA  Fresca ', quantity: null, unit: null, unit_price: null, total_price: null, allergens: ['pescado'] },
				{ description: 'Tomate', quantity: null, unit: null, unit_price: null, total_price: null, allergens: [] },
				{ description: 'Sal', quantity: null, unit: null, unit_price: null, total_price: null },
			],
		} as never);
		expect([...map.keys()]).toEqual(['merluza fresca']);
		expect(map.get('merluza fresca')).toEqual(['pescado']);
	});

	it('returns an empty map when there is nothing extracted', () => {
		expect(extractedAllergensByKey(undefined).size).toBe(0);
	});
});

describe.skipIf(!hasDbEnv)('applyExtractedAllergens against a real database', () => {
	let rid = '';
	let productId = 0;

	beforeEach(async () => {
		if (rid) await cleanupTestRestaurant(rid);
		rid = (await createTestRestaurant('allergens')).id;
		const [row] = await testSql`
			INSERT INTO products (restaurant_id, canonical_name, name_key)
			VALUES (${rid}, 'Merluza', 'merluza') RETURNING id
		`;
		productId = Number(row!.id);
	});

	afterAll(async () => {
		await cleanupTestRestaurant(rid);
		await closeDb();
	});

	const read = async () => {
		const [row] = await testSql`SELECT allergens, allergens_source FROM products WHERE id = ${productId}`;
		return row as { allergens: string[]; allergens_source: string | null };
	};

	it('fills an empty product and marks the source as extracted', async () => {
		expect(await applyExtractedAllergens(rid, productId, ['pescado'])).toBe(true);
		expect(await read()).toEqual({ allergens: ['pescado'], allergens_source: 'extracted' });
	});

	it('never overwrites what a person declared', async () => {
		await testSql`UPDATE products SET allergens = '["gluten"]'::jsonb, allergens_source = 'manual' WHERE id = ${productId}`;
		expect(await applyExtractedAllergens(rid, productId, ['pescado'])).toBe(false);
		expect((await read()).allergens).toEqual(['gluten']);
	});

	it('does not re-fill a product extraction already answered', async () => {
		expect(await applyExtractedAllergens(rid, productId, ['pescado'])).toBe(true);
		expect(await applyExtractedAllergens(rid, productId, ['gluten'])).toBe(false);
		expect((await read()).allergens).toEqual(['pescado']);
	});

	it('drops codes that are not one of the fourteen, and no-ops on an empty result', async () => {
		expect(await applyExtractedAllergens(rid, productId, ['unicornio'])).toBe(false);
		expect((await read()).allergens).toEqual([]);
	});

	it('cannot reach a product in another tenant', async () => {
		const other = await createTestRestaurant('allergens-other');
		try {
			expect(await applyExtractedAllergens(other.id, productId, ['pescado'])).toBe(false);
			expect((await read()).allergens).toEqual([]);
		} finally {
			await cleanupTestRestaurant(other.id);
		}
	});
});
