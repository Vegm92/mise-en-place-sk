/**
 * Issue #730: `saveFacts` stamped `allergensSource: 'manual'` unconditionally,
 * even when the submitter ticked no allergens at all. `applyExtractedAllergens`
 * only ever fills a product whose `allergens_source IS DISTINCT FROM 'manual'`,
 * so an empty save permanently opted the product out of allergen extraction
 * from delivery notes, with no UI way back. Fix (mirrors the existing
 * `nutritionSource` pattern two lines below): `allergensSource: allergens.length
 * > 0 ? 'manual' : null` — an empty save round-trips to null and leaves
 * extraction free to fill it later; a save with allergens ticked still locks
 * out extraction as before.
 *
 * DB-backed: the db singleton is swapped for the real test client so the
 * `saveFacts` action and `applyExtractedAllergens` run against real Postgres.
 * Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { normalizeProductKey } from '../src/lib/server/normalize';
import { applyExtractedAllergens } from '../src/lib/server/products';
import { actions } from '../src/routes/(app)/products/[id]/+page.server';

async function runSaveFacts(productId: number, rid: string, allergens: string[]): Promise<void> {
	const data = new FormData();
	for (const code of allergens) data.append('allergens', code);
	const event = {
		params: { id: String(productId) },
		locals: { restaurantId: rid },
		request: { formData: async () => data },
	} as never;
	try {
		await (actions.saveFacts as (e: never) => Promise<unknown>)(event);
	} catch (thrown) {
		if (isRedirect(thrown)) return;
		throw thrown;
	}
}

async function newProduct(rid: string, name: string) {
	const [row] = await testSql`
		INSERT INTO products (restaurant_id, canonical_name, name_key)
		VALUES (${rid}, ${name}, ${normalizeProductKey(name)}) RETURNING id
	`;
	return Number(row.id);
}

async function productRow(id: number) {
	const [row] = await testSql`
		SELECT allergens, allergens_source FROM products WHERE id = ${id}
	`;
	return row as { allergens: string[]; allergens_source: string | null };
}

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	rid = (await createTestRestaurant('730-allergens-source')).id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('saveFacts — allergensSource stays null on an empty save, not "manual" (#730)', () => {
	it('an empty save on a fresh product leaves allergens_source null and extraction still succeeds', async () => {
		const id = await newProduct(rid, 'Merluza 730a');

		await runSaveFacts(id, rid, []);

		const after = await productRow(id);
		expect(after.allergens_source).toBeNull();
		expect(after.allergens).toEqual([]);

		expect(await applyExtractedAllergens(rid, id, ['pescado'])).toBe(true);
		expect((await productRow(id)).allergens).toEqual(['pescado']);
	});

	it('a save WITH allergens ticked stamps "manual" and blocks a later extraction', async () => {
		const id = await newProduct(rid, 'Gamba 730b');

		await runSaveFacts(id, rid, ['crustaceos']);

		const after = await productRow(id);
		expect(after.allergens_source).toBe('manual');
		expect(after.allergens).toEqual(['crustaceos']);

		expect(await applyExtractedAllergens(rid, id, ['pescado'])).toBe(false);
		expect((await productRow(id)).allergens).toEqual(['crustaceos']);
	});

	it('ticked-then-cleared round-trips to null and re-enables extraction', async () => {
		const id = await newProduct(rid, 'Almeja 730c');

		await runSaveFacts(id, rid, ['moluscos']);
		expect((await productRow(id)).allergens_source).toBe('manual');

		await runSaveFacts(id, rid, []);
		const after = await productRow(id);
		expect(after.allergens_source).toBeNull();
		expect(after.allergens).toEqual([]);

		expect(await applyExtractedAllergens(rid, id, ['moluscos'])).toBe(true);
		expect((await productRow(id)).allergens).toEqual(['moluscos']);
	});
});
