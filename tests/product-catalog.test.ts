/**
 * DB-backed tests for product catalog resolution (issue #298, Phase 2).
 *
 * Runs against a live Postgres with migrations 0018 + 0019 applied (needs
 * mep_norm_key, the products/product_aliases tables, and pg_trgm); skipped
 * when DATABASE_URL is absent.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import {
	resolveLineProducts, confirmProductAlias, mergeIntoProduct, FUZZY_THRESHOLD,
} from '../src/lib/server/products';

let rid = '';
let supplierId: number | null = null;

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('prodcat');
	rid = r.id;
	const [sup] = await testSql`
		INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, '__prodcat_supplier__') RETURNING id`;
	supplierId = sup.id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM product_aliases WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM products WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('resolveLineProducts — new product', () => {
	it('creates a product + confirmed exact alias for an unseen description', async () => {
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [
			{ description: 'Tomate Pera', unit: 'kg', category: 'Frutas y Verduras' },
		]);
		const r = resolved.get('Tomate Pera')!;
		expect(r.status).toBe('created');

		const [prod] = await testSql`
			SELECT canonical_name, name_key, category, canonical_unit FROM products
			WHERE restaurant_id = ${rid} AND id = ${r.productId}`;
		expect(prod.name_key).toBe('tomate pera');
		expect(prod.canonical_name).toBe('Tomate Pera');
		expect(prod.category).toBe('Frutas y Verduras');
		expect(prod.canonical_unit).toBe('kg');

		const [alias] = await testSql`
			SELECT raw_key, source, confirmed_at FROM product_aliases
			WHERE restaurant_id = ${rid} AND product_id = ${r.productId}`;
		expect(alias.raw_key).toBe('tomate pera');
		expect(alias.source).toBe('exact');
		expect(alias.confirmed_at).not.toBeNull();
	});

	it('canonicalizes the unit spelling on the product', async () => {
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [
			{ description: 'Harina de fuerza', unit: 'KILOS' },
		]);
		const [prod] = await testSql`
			SELECT canonical_unit FROM products WHERE restaurant_id = ${rid} AND id = ${resolved.get('Harina de fuerza')!.productId}`;
		expect(prod.canonical_unit).toBe('kg');
	});
});

describe.skipIf(!hasDbEnv)('resolveLineProducts — exact alias re-hit', () => {
	it('reuses the same product across casing/accent variants (no new product)', async () => {
		const first = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Azúcar Blanquilla', unit: 'kg' }]);
		const pid = first.get('Azúcar Blanquilla')!.productId;

		const second = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'AZUCAR  blanquilla', unit: 'kg' }]);
		const r = second.get('AZUCAR  blanquilla')!;
		expect(r.status).toBe('exact');
		expect(r.productId).toBe(pid);

		const [{ count }] = await testSql`SELECT COUNT(*)::int AS count FROM products WHERE restaurant_id = ${rid}`;
		expect(count).toBe(1);
	});
});

describe.skipIf(!hasDbEnv)('resolveLineProducts — fuzzy suggestion', () => {
	it('never auto-links a near-duplicate — creates its own product and only suggests merging', async () => {
		const first = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera', unit: 'kg' }]);
		const basePid = first.get('Tomate pera')!.productId;

		const resolved = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera roja', unit: 'kg' }]);
		const r = resolved.get('Tomate pera roja')!;
		expect(r.status).toBe('fuzzy');
		expect(r.productId).not.toBe(basePid); // never linked on uncertain data — gets its own product
		expect(r.suggestion?.candidateName).toBe('Tomate pera');
		expect(r.suggestion?.candidateProductId).toBe(basePid);
		expect(r.suggestion!.score).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);

		const [alias] = await testSql`
			SELECT source, confirmed_at, product_id FROM product_aliases
			WHERE restaurant_id = ${rid} AND raw_key = 'tomate pera roja'`;
		expect(alias.product_id).toBe(r.productId); // its own alias, not the candidate's
		expect(alias.source).toBe('exact');
		expect(alias.confirmed_at).not.toBeNull(); // confirmed immediately — it's an exact match to its own (new) product
	});

	it('creates a distinct product when nothing is similar enough', async () => {
		await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera', unit: 'kg' }]);
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Lomo de cerdo', unit: 'kg' }]);
		expect(resolved.get('Lomo de cerdo')!.status).toBe('created');
		const [{ count }] = await testSql`SELECT COUNT(*)::int AS count FROM products WHERE restaurant_id = ${rid}`;
		expect(count).toBe(2);
	});
});

describe.skipIf(!hasDbEnv)('resolveLineProducts — pack info carried onto new product (issue #386)', () => {
	it('stamps units_per_pack and base_unit derived from the line description', async () => {
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [
			{ description: 'Leche entera 6x1L', unit: 'caja', unitsPerPack: 6, baseUnit: 'L' },
		]);
		const r = resolved.get('Leche entera 6x1L')!;
		expect(r.status).toBe('created');

		const [prod] = await testSql`
			SELECT units_per_pack, base_unit FROM products WHERE restaurant_id = ${rid} AND id = ${r.productId}`;
		expect(prod.units_per_pack).toBe(6);
		expect(prod.base_unit).toBe('L');
	});

	it('leaves units_per_pack and base_unit null when the line has no derivable pack size', async () => {
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [
			{ description: 'Tomate Pera', unit: 'kg' },
		]);
		const r = resolved.get('Tomate Pera')!;
		expect(r.status).toBe('created');

		const [prod] = await testSql`
			SELECT units_per_pack, base_unit FROM products WHERE restaurant_id = ${rid} AND id = ${r.productId}`;
		expect(prod.units_per_pack).toBeNull();
		expect(prod.base_unit).toBeNull();
	});
});

describe.skipIf(!hasDbEnv)('resolveLineProducts — batch behavior', () => {
	it('resolves duplicate keys in one call to a single product', async () => {
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [
			{ description: 'Leche entera', unit: 'L' },
			{ description: 'LECHE  ENTERA', unit: 'L' },
		]);
		const a = resolved.get('Leche entera')!;
		const b = resolved.get('LECHE  ENTERA')!;
		expect(a.productId).toBe(b.productId);
		const [{ count }] = await testSql`SELECT COUNT(*)::int AS count FROM products WHERE restaurant_id = ${rid} AND name_key = 'leche entera'`;
		expect(count).toBe(1);
	});

	it('skips lines whose normalized key is empty', async () => {
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [
			{ description: '   ', unit: 'kg' },
			{ description: '', unit: null },
		]);
		expect(resolved.size).toBe(0);
	});
});

describe.skipIf(!hasDbEnv)('confirmProductAlias / mergeIntoProduct — deciding a fuzzy suggestion', () => {
	it('confirming a fuzzy suggestion merges its throwaway product into the candidate', async () => {
		const base = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera', unit: 'kg' }]);
		const basePid = base.get('Tomate pera')!.productId;
		const fuzzy = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera roja', unit: 'kg' }]);
		const r = fuzzy.get('Tomate pera roja')!;
		expect(r.status).toBe('fuzzy');
		expect(r.suggestion?.candidateProductId).toBe(basePid);

		// This is what the "confirm" button on the notification does: merge into the suggested candidate.
		const res = await mergeIntoProduct(testDb, rid, 'Tomate pera roja', r.suggestion!.candidateProductId);
		expect(res).toEqual({ ok: true, productId: basePid });

		const [alias] = await testSql`
			SELECT product_id, source, confirmed_at FROM product_aliases WHERE restaurant_id = ${rid} AND raw_key = 'tomate pera roja'`;
		expect(alias.product_id).toBe(basePid);
		expect(alias.source).toBe('user');
		expect(alias.confirmed_at).not.toBeNull();

		const gone = await testSql`SELECT id FROM products WHERE id = ${r.productId}`;
		expect(gone).toHaveLength(0); // the throwaway product created for the fuzzy line is cleaned up
	});

	it('dismissing a fuzzy suggestion leaves its own product untouched (nothing was ever linked)', async () => {
		const base = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera', unit: 'kg' }]);
		const basePid = base.get('Tomate pera')!.productId;
		const fuzzy = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera roja', unit: 'kg' }]);
		const r = fuzzy.get('Tomate pera roja')!;

		// Dismissing is just not acting — no undo is needed because nothing was auto-linked.
		const [alias] = await testSql`
			SELECT product_id FROM product_aliases WHERE restaurant_id = ${rid} AND raw_key = 'tomate pera roja'`;
		expect(alias.product_id).toBe(r.productId);
		expect(alias.product_id).not.toBe(basePid);
	});

	it('confirmProductAlias returns not_found for an unknown description', async () => {
		const res = await confirmProductAlias(testDb, rid, 'Producto que no existe xyz');
		expect(res).toEqual({ ok: false, reason: 'not_found' });
	});
});

describe.skipIf(!hasDbEnv)('resolveLineProducts — dictionary-assisted fuzzy (issue #300)', () => {
	it('matches an abbreviated/SKU-prefixed line to an existing product', async () => {
		const base = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Ternera aguja', unit: 'kg' }]);
		const basePid = base.get('Ternera aguja')!.productId;

		// "REF.1042 TERN. AGUJA" → SKU stripped + "TERN." expanded → "ternera aguja".
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'REF.1042 TERN. AGUJA', unit: 'kg' }]);
		const r = resolved.get('REF.1042 TERN. AGUJA')!;
		expect(r.status).toBe('fuzzy');
		expect(r.suggestion?.candidateProductId).toBe(basePid); // suggested, not auto-linked
	});
});

describe.skipIf(!hasDbEnv)('mergeIntoProduct (issue #300)', () => {
	it('repoints alias + line items to the target and removes the throwaway product', async () => {
		const target = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Merluza', unit: 'kg' }]);
		const targetPid = target.get('Merluza')!.productId;

		// A description the deterministic layers can't match — it creates its own
		// product; the LLM later proposes it is really "Merluza".
		const created = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Pescado blanco del norte', unit: 'kg' }]);
		const throwawayPid = created.get('Pescado blanco del norte')!.productId;
		expect(created.get('Pescado blanco del norte')!.status).toBe('created');
		expect(throwawayPid).not.toBe(targetPid);

		const [inv] = await testSql`INSERT INTO invoices (restaurant_id, status) VALUES (${rid}, 'pending') RETURNING id`;
		const [li] = await testSql`
			INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, unit, unit_price, product_id)
			VALUES (${inv.id}, ${rid}, 'Pescado blanco del norte', 'kg', 9.0, ${throwawayPid}) RETURNING id`;

		const res = await mergeIntoProduct(testDb, rid, 'Pescado blanco del norte', targetPid);
		expect(res).toEqual({ ok: true, productId: targetPid });

		const [alias] = await testSql`SELECT product_id, source FROM product_aliases WHERE restaurant_id = ${rid} AND raw_key = 'pescado blanco del norte'`;
		expect(alias.product_id).toBe(targetPid);
		expect(alias.source).toBe('user');

		const [liAfter] = await testSql`SELECT product_id FROM invoice_line_items WHERE id = ${li.id}`;
		expect(liAfter.product_id).toBe(targetPid);

		const gone = await testSql`SELECT id FROM products WHERE id = ${throwawayPid}`;
		expect(gone).toHaveLength(0);
	});

	it('returns not_found when the target product is not in the tenant', async () => {
		await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Sardina', unit: 'kg' }]);
		const res = await mergeIntoProduct(testDb, rid, 'Sardina', 2_000_000_000);
		expect(res).toEqual({ ok: false, reason: 'not_found' });
	});
});
