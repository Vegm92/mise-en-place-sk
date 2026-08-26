/**
 * DB-level enforcement of the July 2026 race-condition & idempotency fixes.
 *
 * These assert the *constraints* (not just app code) so a future schema change
 * that drops one is caught: the supplier case-insensitive unique index (#238),
 * the invoice content-hash unique index (#237), and the user_restaurants
 * composite primary key (#241). Runs against the live test DB; skipped without.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getOrCreateSupplierId } from '../src/lib/server/supplier';
import { suppliers } from '../src/lib/server/schema';
import { testDb, testSql, createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './helpers/test-db';

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

describe.skipIf(!hasDbEnv)('#238 supplier get-or-create is atomic and case-insensitive', () => {
	it('returns one id for the same name regardless of case or surrounding space', async () => {
		const r = await createTestRestaurant('supplier-upsert');
		try {
			const a = await getOrCreateSupplierId(r.id, 'Makro', testDb);
			const b = await getOrCreateSupplierId(r.id, 'makro', testDb);
			const c = await getOrCreateSupplierId(r.id, '  Makro  ', testDb);
			expect(b).toBe(a);
			expect(c).toBe(a);
			const rows = await testDb.select().from(suppliers).where(eq(suppliers.restaurantId, r.id));
			expect(rows).toHaveLength(1);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('rejects a case-variant duplicate name via the unique index', async () => {
		const r = await createTestRestaurant('supplier-unique');
		try {
			await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${r.id}, 'Coca-Cola')`;
			await expect(
				testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${r.id}, 'coca-cola')`,
			).rejects.toThrow();
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});

describe.skipIf(!hasDbEnv)('#237 content-hash dedup is a hard unique constraint', () => {
	it('rejects a second live invoice with the same (restaurant_id, content_hash)', async () => {
		const r = await createTestRestaurant('hash-unique');
		try {
			// No invoice number → uq_invoices_rid_supplier_number does not apply, so
			// the content-hash index is the only thing preventing the duplicate.
			await testSql`INSERT INTO invoices (restaurant_id, content_hash, status) VALUES (${r.id}, 'abc123', 'pending')`;
			await expect(
				testSql`INSERT INTO invoices (restaurant_id, content_hash, status) VALUES (${r.id}, 'abc123', 'pending')`,
			).rejects.toThrow();
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('allows re-saving the same hash once the first row is soft-deleted', async () => {
		const r = await createTestRestaurant('hash-softdel');
		try {
			await testSql`INSERT INTO invoices (restaurant_id, content_hash, status, deleted_at) VALUES (${r.id}, 'dup', 'pending', now())`;
			// The partial index excludes deleted rows, so a fresh live save is fine.
			await testSql`INSERT INTO invoices (restaurant_id, content_hash, status) VALUES (${r.id}, 'dup', 'pending')`;
			const rows = await testSql`SELECT count(*)::int AS n FROM invoices WHERE restaurant_id = ${r.id}`;
			expect(rows[0].n).toBe(2);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});

describe.skipIf(!hasDbEnv)('#241 user_restaurants has a composite primary key', () => {
	it('rejects a duplicate (user_id, restaurant_id) membership', async () => {
		const r = await createTestRestaurant('urest-pk');
		const userId = randomUUID();
		try {
			await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${userId}, ${r.id}, 'owner')`;
			await expect(
				testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${userId}, ${r.id}, 'member')`,
			).rejects.toThrow();
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});
