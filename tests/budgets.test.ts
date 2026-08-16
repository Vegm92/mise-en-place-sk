/**
 * Budgets page — category budget CRUD, custom category support, and multi-tenancy.
 *
 * Tests the DB operations that back +page.server.ts load() and the save action:
 *   - upsert / delete semantics
 *   - custom categories (not in VALID_CATEGORIES) persist and are surfaced on load
 *   - multi-tenancy: one restaurant's budgets never appear for another
 *   - _categories payload parsing/validation mirrors the action's guard logic
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { categoryBudgets } from '../src/lib/server/schema';
import { VALID_CATEGORIES } from '../src/lib/constants';

const MONTH = '2026-01';

let rid1 = '', rid2 = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r1 = await createTestRestaurant('budgets-a');
	const r2 = await createTestRestaurant('budgets-b');
	rid1 = r1.id;
	rid2 = r2.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid1);
	await cleanupTestRestaurant(rid2);
	await closeDb();
});

// ── Upsert / delete semantics ─────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('categoryBudgets — upsert and delete', () => {
	it('inserts a budget for a VALID_CATEGORY', async () => {
		const cat = VALID_CATEGORIES[0];
		await testDb.insert(categoryBudgets)
			.values({ restaurantId: rid1, category: cat, month: MONTH, monthlyBudget: '1500.00' })
			.onConflictDoUpdate({
				target: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],
				set: { monthlyBudget: '1500.00' },
			});

		const rows = await testDb.select().from(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, cat)));

		expect(rows).toHaveLength(1);
		expect(rows[0].monthlyBudget).toBe('1500.00');
	});

	it('updates an existing budget via upsert', async () => {
		const cat = VALID_CATEGORIES[0];
		await testDb.insert(categoryBudgets)
			.values({ restaurantId: rid1, category: cat, month: MONTH, monthlyBudget: '2000.00' })
			.onConflictDoUpdate({
				target: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],
				set: { monthlyBudget: '2000.00' },
			});

		const rows = await testDb.select().from(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, cat)));

		expect(rows).toHaveLength(1);
		expect(rows[0].monthlyBudget).toBe('2000.00');
	});

	it('deletes a budget row when the amount is cleared', async () => {
		const cat = VALID_CATEGORIES[1];
		await testDb.insert(categoryBudgets)
			.values({ restaurantId: rid1, category: cat, month: MONTH, monthlyBudget: '800.00' })
			.onConflictDoUpdate({
				target: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],
				set: { monthlyBudget: '800.00' },
			});

		// Simulate the action deleting when raw value is empty / NaN
		await testDb.delete(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, cat)));

		const rows = await testDb.select().from(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, cat)));

		expect(rows).toHaveLength(0);
	});

	it('duplicate insert is rejected by the unique constraint', async () => {
		const cat = VALID_CATEGORIES[2];
		await testDb.insert(categoryBudgets)
			.values({ restaurantId: rid1, category: cat, month: MONTH, monthlyBudget: '500.00' });

		await expect(
			testSql`INSERT INTO category_budgets (restaurant_id, category, month, monthly_budget)
			        VALUES (${rid1}, ${cat}, ${MONTH}, 600)`
		).rejects.toThrow();
	});
});

// ── Custom categories ─────────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('categoryBudgets — custom categories', () => {
	const customCat = 'Postres Artesanales';

	it('saves a budget for a category not in VALID_CATEGORIES', async () => {
		expect(VALID_CATEGORIES).not.toContain(customCat);

		await testDb.insert(categoryBudgets)
			.values({ restaurantId: rid1, category: customCat, month: MONTH, monthlyBudget: '350.00' })
			.onConflictDoUpdate({
				target: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],
				set: { monthlyBudget: '350.00' },
			});

		const rows = await testDb.select().from(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, customCat)));

		expect(rows).toHaveLength(1);
		expect(rows[0].monthlyBudget).toBe('350.00');
	});

	it('custom category appears when merging DB rows with VALID_CATEGORIES', async () => {
		const storedRows = await testDb.select().from(categoryBudgets)
			.where(eq(categoryBudgets.restaurantId, rid1));

		const storedCats = storedRows.map(r => r.category);
		const merged = [
			...VALID_CATEGORIES,
			...storedCats.filter(c => !VALID_CATEGORIES.includes(c)),
		];

		expect(merged).toContain(customCat);
		// VALID_CATEGORIES are not duplicated
		const counts = merged.reduce<Record<string, number>>((acc, c) => {
			acc[c] = (acc[c] ?? 0) + 1;
			return acc;
		}, {});
		for (const cat of VALID_CATEGORIES) {
			expect(counts[cat]).toBe(1);
		}
	});

	it('updates the custom category budget via upsert', async () => {
		await testDb.insert(categoryBudgets)
			.values({ restaurantId: rid1, category: customCat, month: MONTH, monthlyBudget: '500.00' })
			.onConflictDoUpdate({
				target: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],
				set: { monthlyBudget: '500.00' },
			});

		const [row] = await testDb.select().from(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, customCat)));

		expect(row.monthlyBudget).toBe('500.00');
	});
});

// ── Multi-tenancy ─────────────────────────────────────────────────────────────

describe.skipIf(!hasDbEnv)('categoryBudgets — multi-tenancy isolation', () => {
	const sharedName = 'Shared Category Name';

	beforeAll(async () => {
		await testDb.insert(categoryBudgets)
			.values({ restaurantId: rid1, category: sharedName, month: MONTH, monthlyBudget: '1000.00' })
			.onConflictDoUpdate({
				target: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],
				set: { monthlyBudget: '1000.00' },
			});
		await testDb.insert(categoryBudgets)
			.values({ restaurantId: rid2, category: sharedName, month: MONTH, monthlyBudget: '9999.00' })
			.onConflictDoUpdate({
				target: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],
				set: { monthlyBudget: '9999.00' },
			});
	});

	it('same category name in two restaurants stores independent budgets', async () => {
		const [r1row] = await testDb.select().from(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, sharedName)));
		const [r2row] = await testDb.select().from(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid2), eq(categoryBudgets.category, sharedName)));

		expect(r1row.monthlyBudget).toBe('1000.00');
		expect(r2row.monthlyBudget).toBe('9999.00');
	});

	it('load scoped to rid1 does not surface rid2 budgets', async () => {
		const rows = await testDb.select().from(categoryBudgets)
			.where(eq(categoryBudgets.restaurantId, rid1));

		const ids = rows.map(r => r.restaurantId);
		expect(ids.every(id => id === rid1)).toBe(true);
	});

	it('deleting rid1 budgets does not affect rid2', async () => {
		await testDb.delete(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, sharedName)));

		const r2rows = await testDb.select().from(categoryBudgets)
			.where(and(eq(categoryBudgets.restaurantId, rid2), eq(categoryBudgets.category, sharedName)));

		expect(r2rows).toHaveLength(1);
		expect(r2rows[0].monthlyBudget).toBe('9999.00');
	});
});

// ── _categories payload validation (mirrors the action's guard logic) ─────────

describe.skipIf(!hasDbEnv)('_categories payload parsing', () => {
	/** Mirrors the parsing logic in the save action exactly. */
	function parseCategories(raw: string | null): string[] {
		try {
			const parsed = JSON.parse(String(raw ?? ''));
			return Array.isArray(parsed)
				? parsed
					.map((c: unknown) => String(c).trim())
					.filter(c => c.length > 0 && c.length <= 80)
				: VALID_CATEGORIES;
		} catch {
			return VALID_CATEGORIES;
		}
	}

	it('parses a valid JSON array of category names', () => {
		const result = parseCategories(JSON.stringify(['Meat', 'Seafood', 'Custom Cat']));
		expect(result).toEqual(['Meat', 'Seafood', 'Custom Cat']);
	});

	it('falls back to VALID_CATEGORIES on invalid JSON', () => {
		expect(parseCategories('not json')).toEqual(VALID_CATEGORIES);
		expect(parseCategories(null)).toEqual(VALID_CATEGORIES);
		expect(parseCategories('')).toEqual(VALID_CATEGORIES);
	});

	it('falls back to VALID_CATEGORIES when value is not an array', () => {
		expect(parseCategories(JSON.stringify({ cat: 'Meat' }))).toEqual(VALID_CATEGORIES);
		expect(parseCategories(JSON.stringify('Meat'))).toEqual(VALID_CATEGORIES);
	});

	it('strips categories longer than 80 characters', () => {
		const tooLong = 'A'.repeat(81);
		const result = parseCategories(JSON.stringify(['Meat', tooLong, 'Seafood']));
		expect(result).toEqual(['Meat', 'Seafood']);
	});

	it('strips empty-string categories', () => {
		const result = parseCategories(JSON.stringify(['Meat', '', '  ', 'Seafood']));
		expect(result).toEqual(['Meat', 'Seafood']);
	});

	it('trims whitespace from category names', () => {
		const result = parseCategories(JSON.stringify(['  Meat  ', ' Seafood']));
		expect(result).toEqual(['Meat', 'Seafood']);
	});

	it('accepts a category exactly 80 characters long', () => {
		const exactly80 = 'A'.repeat(80);
		const result = parseCategories(JSON.stringify([exactly80]));
		expect(result).toEqual([exactly80]);
	});
});
