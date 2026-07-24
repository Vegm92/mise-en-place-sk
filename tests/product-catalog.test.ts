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
	resolveLineProducts, confirmProductAlias, rejectProductAlias, mergeIntoProduct, FUZZY_THRESHOLD,
} from '../src/lib/server/product-catalog';

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
	it('auto-links a near-duplicate to the existing product with a pending alias', async () => {
		const first = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera', unit: 'kg' }]);
		const basePid = first.get('Tomate pera')!.productId;

		const resolved = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera roja', unit: 'kg' }]);
		const r = resolved.get('Tomate pera roja')!;
		expect(r.status).toBe('fuzzy');
		expect(r.productId).toBe(basePid); // linked to the existing product, not a new one
		expect(r.suggestion?.candidateName).toBe('Tomate pera');
		expect(r.suggestion!.score).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);

		const [alias] = await testSql`
			SELECT source, confirmed_at FROM product_aliases
			WHERE restaurant_id = ${rid} AND raw_key = 'tomate pera roja'`;
		expect(alias.source).toBe('fuzzy');
		expect(alias.confirmed_at).toBeNull(); // pending confirmation
	});

	it('creates a distinct product when nothing is similar enough', async () => {
		await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera', unit: 'kg' }]);
		const resolved = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Lomo de cerdo', unit: 'kg' }]);
		expect(resolved.get('Lomo de cerdo')!.status).toBe('created');
		const [{ count }] = await testSql`SELECT COUNT(*)::int AS count FROM products WHERE restaurant_id = ${rid}`;
		expect(count).toBe(2);
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

describe.skipIf(!hasDbEnv)('confirmProductAlias / rejectProductAlias', () => {
	it('confirm marks the pending fuzzy alias as user-confirmed', async () => {
		await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera', unit: 'kg' }]);
		const fuzzy = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera roja', unit: 'kg' }]);
		expect(fuzzy.get('Tomate pera roja')!.status).toBe('fuzzy');

		const res = await confirmProductAlias(testDb, rid, 'Tomate pera roja');
		expect(res.ok).toBe(true);

		const [alias] = await testSql`
			SELECT source, confirmed_at FROM product_aliases WHERE restaurant_id = ${rid} AND raw_key = 'tomate pera roja'`;
		expect(alias.source).toBe('user');
		expect(alias.confirmed_at).not.toBeNull();
	});

	it('reject splits the description into its own product and repoints line items', async () => {
		const base = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera', unit: 'kg' }]);
		const basePid = base.get('Tomate pera')!.productId;
		const fuzzy = await resolveLineProducts(testDb, rid, supplierId, [{ description: 'Tomate pera roja', unit: 'kg' }]);
		expect(fuzzy.get('Tomate pera roja')!.productId).toBe(basePid); // wrongly linked

		// A line item fuzzy-linked to the wrong product.
		const [inv] = await testSql`
			INSERT INTO invoices (restaurant_id, status) VALUES (${rid}, 'pending') RETURNING id`;
		const [li] = await testSql`
			INSERT INTO invoice_line_items (invoice_id, restaurant_id, description, unit, unit_price, product_id)
			VALUES (${inv.id}, ${rid}, 'Tomate pera roja', 'kg', 2.5, ${basePid}) RETURNING id`;

		const res = await rejectProductAlias(testDb, rid, 'Tomate pera roja');
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.productId).not.toBe(basePid);

		const [aliasAfter] = await testSql`
			SELECT product_id, source, confirmed_at FROM product_aliases WHERE restaurant_id = ${rid} AND raw_key = 'tomate pera roja'`;
		expect(aliasAfter.product_id).toBe(res.productId);
		expect(aliasAfter.confirmed_at).not.toBeNull();

		const [liAfter] = await testSql`SELECT product_id FROM invoice_line_items WHERE id = ${li.id}`;
		expect(liAfter.product_id).toBe(res.productId); // repointed to the new product
	});

	it('returns not_found for an unknown description', async () => {
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
		expect(r.productId).toBe(basePid);
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
