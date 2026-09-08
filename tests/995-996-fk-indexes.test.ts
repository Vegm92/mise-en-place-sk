/**
 * Issues #995 and #996 — referential integrity and foreign-key index coverage
 * (migration drizzle/0081_fk_covering_indexes.sql).
 *
 * #995: `user_restaurants.user_id` had no reference to `users`, so a
 * membership could outlive the user it belongs to. `memberLocations()` reads
 * that table to decide which restaurants a caller may see, so an orphan row
 * there is a membership with no owner. The account-deletion route already
 * deletes memberships explicitly before the user row, so the cascade is a
 * backstop — the two tests below pin both halves: the orphan is now
 * impossible, and deleting a user still leaves no membership behind.
 *
 * #996: the nine foreign keys the audit found with no covering index, plus
 * the two that were covered only by an index that excluded rows
 * (`invoices.supplier_id`, unique only WHERE invoice_number IS NOT NULL;
 * `mrr_snapshots.restaurant_id`, leading on `month` or partial on
 * mrr_cents > 0). Asserted against pg_index rather than the migration text so
 * a later migration that drops one fails here.
 *
 * A composite index counts only when the foreign key's column leads it — a
 * `(restaurant_id, supplier_id)` index does not help a cascade from
 * `suppliers`. A partial index does not count either: it excludes rows.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { testSql, closeDb, hasDbEnv, createTestRestaurant, cleanupTestRestaurant } from './helpers/test-db';

afterAll(() => closeDb());

const COVERED_FKS: Array<[table: string, column: string]> = [
	['batch_items', 'restaurant_id'],
	['upload_batches', 'restaurant_id'],
	['extraction_corrections', 'restaurant_id'],
	['extraction_corrections', 'invoice_id'],
	['extraction_corrections', 'supplier_id'],
	['chat_sessions', 'restaurant_id'],
	['supplier_metrics', 'restaurant_id'],
	['accounts', 'user_id'],
	['sessions', 'user_id'],
	['idempotency_keys', 'restaurant_id'],
	['invoices', 'supplier_id'],
	['mrr_snapshots', 'restaurant_id'],
];

async function leadingIndexes(table: string, column: string): Promise<string[]> {
	const rows = await testSql`
		SELECT ci.relname AS name
		FROM pg_index i
		JOIN pg_class ct ON ct.oid = i.indrelid
		JOIN pg_class ci ON ci.oid = i.indexrelid
		JOIN pg_namespace n ON n.oid = ct.relnamespace
		JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
		WHERE n.nspname = 'public'
			AND ct.relname = ${table}
			AND a.attname = ${column}
			AND i.indpred IS NULL
	`;
	return rows.map(r => r.name as string);
}

describe.skipIf(!hasDbEnv)('#995 — user_restaurants.user_id references users', () => {
	it('the foreign key exists and cascades on delete', async () => {
		const rows = await testSql`
			SELECT c.conname, c.confdeltype
			FROM pg_constraint c
			JOIN pg_class t ON t.oid = c.conrelid
			JOIN pg_class r ON r.oid = c.confrelid
			JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
			WHERE c.contype = 'f' AND t.relname = 'user_restaurants'
				AND r.relname = 'users' AND a.attname = 'user_id'
		`;
		expect(rows.length, 'user_restaurants.user_id has no FK to users').toBe(1);
		expect(rows[0].confdeltype, 'FK should be ON DELETE CASCADE').toBe('c');
	});

	it('rejects a membership whose user does not exist', async () => {
		const restaurant = await createTestRestaurant('fk-orphan');
		try {
			await expect(testSql`
				INSERT INTO user_restaurants (user_id, restaurant_id, role)
				VALUES (gen_random_uuid(), ${restaurant.id}, 'owner')
			`).rejects.toThrow(/foreign key|violates/i);
		} finally {
			await cleanupTestRestaurant(restaurant.id);
		}
	});

	it('deleting a user removes the membership rather than orphaning it', async () => {
		const restaurant = await createTestRestaurant('fk-cascade');
		const email = `fk-cascade-${Date.now()}@example.com`;
		const [user] = await testSql`
			INSERT INTO users (email, name) VALUES (${email}, 'FK Cascade') RETURNING id
		`;
		try {
			await testSql`
				INSERT INTO user_restaurants (user_id, restaurant_id, role)
				VALUES (${user.id}, ${restaurant.id}, 'owner')
			`;
			await testSql`DELETE FROM users WHERE id = ${user.id}`;
			const left = await testSql`SELECT 1 FROM user_restaurants WHERE user_id = ${user.id}`;
			expect(left.length).toBe(0);
		} finally {
			await testSql`DELETE FROM users WHERE id = ${user.id}`;
			await cleanupTestRestaurant(restaurant.id);
		}
	});
});

describe.skipIf(!hasDbEnv)('#996 — every audited foreign key has an index leading on it', () => {
	it.each(COVERED_FKS)('%s.%s', async (table, column) => {
		const names = await leadingIndexes(table, column);
		expect(names.length, `${table}.${column} has no non-partial index leading on it`).toBeGreaterThan(0);
	});
});
