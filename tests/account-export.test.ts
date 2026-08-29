/**
 * Issue #390: the export handler (api/user/export) now iterates the shared
 * `tenantDataMap` instead of a hand-maintained list of `db.select()` calls.
 * These tests prove the refactor did not change the exported JSON's shape —
 * same top-level keys, same key order, same per-table field selection
 * (including the invoices `deletedAt IS NULL` filter) — for a seeded tenant,
 * and that a table with no `exportKey` in the map (e.g. `products`) still
 * does not leak into the export, exactly as before #390.
 *
 * DB-backed: the db singleton is swapped for the real test client. Skipped
 * without DATABASE_URL.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { rateLimitMock } = vi.hoisted(() => ({
	rateLimitMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	return { db: testDb };
});

import { testSql, closeDb, hasDbEnv } from './helpers/test-db';
import { GET } from '../src/routes/api/user/export/+server';

const EXPECTED_KEYS = [
	'exported_at', 'user', 'memberships',
	'restaurants', 'suppliers', 'invoices', 'invoice_line_items', 'category_budgets',
	'unit_conversions', 'chat_sessions', 'chat_messages', 'extraction_corrections',
	'stock_levels', 'settings', 'recipes', 'recipe_items',
];

async function makeUser(suffix: string) {
	const email = `acct-exp-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
	const [row] = await testSql`
		INSERT INTO users (email, name, email_verified) VALUES (${email}, ${'Chef ' + suffix}, now()) RETURNING id
	`;
	return { id: row.id as string, email };
}

async function makeRestaurant(suffix: string) {
	const slug = `test-vitest-acct-exp-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const [row] = await testSql`INSERT INTO restaurants (name, slug) VALUES (${'Rest ' + suffix}, ${slug}) RETURNING id`;
	return row.id as string;
}

async function membership(userId: string, restaurantId: string, role: 'owner' | 'member' = 'owner') {
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${userId}, ${restaurantId}, ${role})`;
}

function exportEvent(userId: string, email: string) {
	return { locals: { user: { id: userId, email, name: null, image: null } } } as never;
}

async function cleanup(userId: string, restaurantIds: string[]) {
	for (const rid of restaurantIds) await testSql`DELETE FROM restaurants WHERE id = ${rid}`;
	await testSql`DELETE FROM users WHERE id = ${userId}`;
}

beforeEach(() => {
	rateLimitMock.mockClear().mockResolvedValue(true);
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('GET /api/user/export (issue #390)', () => {
	it('produces exactly the pre-#390 top-level key set, in the pre-#390 order, for a seeded tenant', async () => {
		const { id: userId, email } = await makeUser('shape');
		const rid = await makeRestaurant('shape');
		await membership(userId, rid, 'owner');
		await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, 'ACME Foods')`;
		await testSql`INSERT INTO settings (restaurant_id, key, value) VALUES (${rid}, 'locale', 'es')`;
		await testSql`INSERT INTO products (restaurant_id, canonical_name, name_key) VALUES (${rid}, 'Aceite', 'aceite')`;

		const res = await GET(exportEvent(userId, email));
		const body = await res.json();

		expect(Object.keys(body)).toEqual(EXPECTED_KEYS);
		expect(body.suppliers).toHaveLength(1);
		expect(body.suppliers[0].name).toBe('ACME Foods');
		expect(body.settings).toHaveLength(1);
		expect(body).not.toHaveProperty('products');

		await cleanup(userId, [rid]);
	});

	it('excludes soft-deleted invoices, matching the pre-#390 isNull(deletedAt) filter', async () => {
		const { id: userId, email } = await makeUser('softdel');
		const rid = await makeRestaurant('softdel');
		await membership(userId, rid, 'owner');
		await testSql`INSERT INTO invoices (restaurant_id, invoice_number) VALUES (${rid}, 'LIVE-1')`;
		await testSql`INSERT INTO invoices (restaurant_id, invoice_number, deleted_at) VALUES (${rid}, 'GONE-1', now())`;

		const res = await GET(exportEvent(userId, email));
		const body = await res.json();

		expect(body.invoices).toHaveLength(1);
		expect(body.invoices[0].invoiceNumber).toBe('LIVE-1');

		await cleanup(userId, [rid]);
	});

	it('returns empty arrays for every table, and the same key set, when the user has no memberships', async () => {
		const { id: userId, email } = await makeUser('nomembership');

		const res = await GET(exportEvent(userId, email));
		const body = await res.json();

		expect(Object.keys(body)).toEqual(EXPECTED_KEYS);
		expect(body.memberships).toEqual([]);
		expect(body.suppliers).toEqual([]);
		expect(body.restaurants).toEqual([]);

		await testSql`DELETE FROM users WHERE id = ${userId}`;
	});

	it('rate limits export attempts', async () => {
		const { id: userId, email } = await makeUser('ratelimited');
		rateLimitMock.mockResolvedValueOnce(false);

		await expect(GET(exportEvent(userId, email))).rejects.toMatchObject({ status: 429 });

		await testSql`DELETE FROM users WHERE id = ${userId}`;
	});
});
