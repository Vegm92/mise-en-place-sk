/**
 * Issue #515 — drizzle/0049_restaurant_name_backfill.sql collapses the two
 * sources of truth for a restaurant's name (restaurants.name, and a settings
 * row keyed 'restaurant_name') into one.
 *
 * Before this migration the (app) layout load preferred the settings value
 * over restaurants.name whenever a settings row existed — that is the value
 * users actually saw across the app. The migration copies that seen value
 * into restaurants.name wherever the two differ, then deletes every
 * 'restaurant_name' settings row, so the column becomes the sole source.
 *
 * Runs the exact committed migration file against scratch restaurants, so a
 * future edit to the SQL is caught here rather than only in production.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { testSql, createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './helpers/test-db';

const MIGRATION_SQL = readFileSync('drizzle/0049_restaurant_name_backfill.sql', 'utf8');

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

async function restaurantName(id: string) {
	const [row] = await testSql`SELECT name FROM restaurants WHERE id = ${id}`;
	return row!.name as string;
}

async function restaurantNameSettingsRows(id: string) {
	return testSql`SELECT value FROM settings WHERE restaurant_id = ${id} AND key = 'restaurant_name'`;
}

describe.skipIf(!hasDbEnv)('0049_restaurant_name_backfill — single source of truth (issue #515)', () => {
	it('copies the settings value into restaurants.name when they differ, then deletes the settings row', async () => {
		const r = await createTestRestaurant('namebk-differ');
		try {
			await testSql`INSERT INTO settings (restaurant_id, key, value) VALUES (${r.id}, 'restaurant_name', 'Casa Lua')`;

			await testSql.unsafe(MIGRATION_SQL);

			expect(await restaurantName(r.id)).toBe('Casa Lua');
			expect(await restaurantNameSettingsRows(r.id)).toHaveLength(0);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('is a no-op on restaurants.name when the settings value already matches, and still removes the row', async () => {
		const r = await createTestRestaurant('namebk-match');
		try {
			const before = await restaurantName(r.id);
			await testSql`INSERT INTO settings (restaurant_id, key, value) VALUES (${r.id}, 'restaurant_name', ${before})`;

			await testSql.unsafe(MIGRATION_SQL);

			expect(await restaurantName(r.id)).toBe(before);
			expect(await restaurantNameSettingsRows(r.id)).toHaveLength(0);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('leaves restaurants.name untouched when no restaurant_name settings row exists', async () => {
		const r = await createTestRestaurant('namebk-none');
		try {
			const before = await restaurantName(r.id);

			await testSql.unsafe(MIGRATION_SQL);

			expect(await restaurantName(r.id)).toBe(before);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('never lets one restaurant\'s settings row rename another restaurant', async () => {
		const mine = await createTestRestaurant('namebk-mine');
		const other = await createTestRestaurant('namebk-other');
		try {
			const otherNameBefore = await restaurantName(other.id);
			await testSql`INSERT INTO settings (restaurant_id, key, value) VALUES (${mine.id}, 'restaurant_name', 'Only Mine')`;

			await testSql.unsafe(MIGRATION_SQL);

			expect(await restaurantName(mine.id)).toBe('Only Mine');
			expect(await restaurantName(other.id)).toBe(otherNameBefore);
		} finally {
			await cleanupTestRestaurant(mine.id);
			await cleanupTestRestaurant(other.id);
		}
	});

	it('leaves unrelated settings keys alone', async () => {
		const r = await createTestRestaurant('namebk-unrelated');
		try {
			await testSql`INSERT INTO settings (restaurant_id, key, value) VALUES
				(${r.id}, 'restaurant_name', 'New Name'),
				(${r.id}, 'has_completed_onboarding', 'true')`;

			await testSql.unsafe(MIGRATION_SQL);

			const remaining = await testSql`SELECT key FROM settings WHERE restaurant_id = ${r.id}`;
			expect(remaining.map(row => row.key)).toEqual(['has_completed_onboarding']);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('is idempotent — running it again after settings rows are gone changes nothing', async () => {
		const r = await createTestRestaurant('namebk-idempotent');
		try {
			await testSql`INSERT INTO settings (restaurant_id, key, value) VALUES (${r.id}, 'restaurant_name', 'Casa Lua')`;
			await testSql.unsafe(MIGRATION_SQL);
			const nameAfterFirst = await restaurantName(r.id);

			await testSql.unsafe(MIGRATION_SQL);

			expect(await restaurantName(r.id)).toBe(nameAfterFirst);
			expect(await restaurantNameSettingsRows(r.id)).toHaveLength(0);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});
