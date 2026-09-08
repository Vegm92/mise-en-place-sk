/**
 * Restaurant name has one source of truth: restaurants.name (issue #515).
 *
 * Before this fix, renameRestaurant wrote both restaurants.name and a
 * settings row keyed 'restaurant_name' via an UPDATE (never an upsert) —
 * zero rows affected whenever no such settings row existed, since nothing
 * ever created it. The (app) layout load then preferred that settings value
 * over restaurants.name, while the settings page read restaurants.name
 * directly: the same name could show two different values on two pages of
 * the same app, and they drifted the moment only one side was written.
 *
 * This proves renameRestaurant now writes only restaurants.name, and that
 * both the settings page load and the (app) layout load — the two places
 * that show the restaurant name — read that same column and agree,
 * immediately after a rename, with no settings row created in the process.
 *
 * DB-backed: the db singleton is swapped for the real test client so the
 * real load functions and the real action run against Postgres. Skipped
 * without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { memoizeEntitlements } from '../src/lib/server/billing';
import { actions, load as settingsLoad } from '../src/routes/(app)/settings/+page.server';
import { load as layoutLoad } from '../src/routes/(app)/+layout.server';

let rid = '';
let userId = '';

function locals() {
	return {
		user: { id: userId, email: 'name-src@example.com', name: 'Chef', image: null },
		restaurantId: rid,
		lockedRestaurantIds: [] as string[],
		entitlements: memoizeEntitlements(rid),
	};
}

function formEvent(name: string) {
	const data = new FormData();
	data.append('name', name);
	return {
		request: { formData: async () => data },
		locals: locals(),
	} as never;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('name-src');
	rid = r.id;
	const email = `name-src-${Date.now()}@example.com`;
	const [user] = await testSql`
		INSERT INTO users (email, name) VALUES (${email}, ${'Chef'}) RETURNING id`;
	userId = user!.id;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${userId}, ${rid}, 'owner')`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	if (userId) await testSql`DELETE FROM users WHERE id = ${userId}`;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('restaurant name — single source of truth (issue #515)', () => {
	it('renameRestaurant writes only restaurants.name, creating no settings row', async () => {
		const result = await actions.renameRestaurant!(formEvent('Casa del Chef'));
		expect(result).toEqual({ section: 'restaurant', ok: 'set.profile.ok.restaurant' });

		const [row] = await testSql`SELECT name FROM restaurants WHERE id = ${rid}`;
		expect(row!.name).toBe('Casa del Chef');

		const settingsRows = await testSql`SELECT 1 FROM settings WHERE restaurant_id = ${rid} AND key = 'restaurant_name'`;
		expect(settingsRows).toHaveLength(0);
	});

	it('the settings page and the (app) layout agree on the name right after a rename', async () => {
		await actions.renameRestaurant!(formEvent('Bistro Central'));

		const settingsData = await (settingsLoad as (e: unknown) => Promise<Record<string, unknown>>)({ locals: locals() });
		const layoutData = await (layoutLoad as (e: unknown) => Promise<Record<string, unknown>>)({
			locals: locals(),
			url: new URL('https://app.test/dashboard'),
		});

		expect(settingsData.restaurantName).toBe('Bistro Central');
		expect(layoutData.restaurantName).toBe('Bistro Central');
		expect(settingsData.restaurantName).toBe(layoutData.restaurantName);
	});

	it('a rename by a non-owner is refused and changes neither read', async () => {
		const memberEmail = `name-src-member-${Date.now()}@example.com`;
		const [member] = await testSql`INSERT INTO users (email, name) VALUES (${memberEmail}, ${'Member'}) RETURNING id`;
		await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${member!.id}, ${rid}, 'member')`;
		try {
			const before = await testSql`SELECT name FROM restaurants WHERE id = ${rid}`;

			const memberLocals = () => ({
				user: { id: member!.id, email: memberEmail, name: 'Member', image: null },
				restaurantId: rid,
				lockedRestaurantIds: [] as string[],
				entitlements: memoizeEntitlements(rid),
			});
			const result = await actions.renameRestaurant!({
				request: { formData: async () => { const d = new FormData(); d.append('name', 'Hijack'); return d; } },
				locals: memberLocals(),
			} as never);

			expect(result).toMatchObject({ status: 403 });
			const after = await testSql`SELECT name FROM restaurants WHERE id = ${rid}`;
			expect(after[0]!.name).toBe(before[0]!.name);
		} finally {
			await testSql`DELETE FROM users WHERE id = ${member!.id}`;
		}
	});
});
