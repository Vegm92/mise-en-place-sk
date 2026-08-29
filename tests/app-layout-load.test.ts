/**
 * (app) layout load — query reduction + explicit columns (issue #489).
 *
 * The layout used to issue thirteen queries on every navigation, two of them
 * non-sargable (a TO_CHAR-wrapped month filter, and — before #497 — a
 * payload::json level filter). This proves the collapsed load (settings
 * merged into one key IN (...) lookup, invoice/notification badge counts
 * merged into FILTER/subselect queries, the month filter rewritten as a
 * sargable range, and explicit columns on the notification list) still
 * returns the same data shape for a seeded tenant: correct badge counts,
 * the right notifications with no leaked columns, and settings-derived
 * fields (onboarding flag, tutorial step). The restaurant name is no longer
 * one of those settings-derived fields (issue #515) — it comes solely from
 * restaurants.name via the locations list.
 *
 * DB-backed for the load; the db singleton is swapped for the test client.
 * Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { memoizeEntitlements } from '../src/lib/server/billing';
import { load } from '../src/routes/(app)/+layout.server';

let rid = '';
let userId = '';

function locals() {
	return {
		user: { id: userId, email: 'layout-load@example.com', name: 'Chef', image: null },
		restaurantId: rid,
		lockedRestaurantIds: [] as string[],
		entitlements: memoizeEntitlements(rid),
	};
}

async function runLoad() {
	return (await (load as (e: unknown) => Promise<Record<string, unknown>>)({
		locals: locals(),
		url: new URL('https://app.test/dashboard'),
	}));
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('layout-load');
	rid = r.id;
	const email = `layout-load-${Date.now()}@example.com`;
	const [user] = await testSql`
		INSERT INTO users (email, name) VALUES (${email}, ${'Chef'}) RETURNING id`;
	userId = user.id;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${userId}, ${rid}, 'owner')`;

	await testSql`
		INSERT INTO settings (restaurant_id, key, value) VALUES
			(${rid}, 'has_completed_onboarding', 'true'),
			(${rid}, 'tutorial_step', 'done'),
			(${rid}, 'sidebar_collapsed', 'true')
	`;

	await testSql`
		INSERT INTO invoices (restaurant_id, invoice_number, review_state, created_at, deleted_at) VALUES
			(${rid}, 'INV-1', 'por_revisar', now(),                        NULL),
			(${rid}, 'INV-2', 'incidencia',  now(),                        NULL),
			(${rid}, 'INV-3', 'por_revisar', now(),                        NULL),
			(${rid}, 'INV-4', 'revisado',    now(),                        NULL),
			(${rid}, 'INV-5', 'revisado',    now() - interval '2 months',  NULL),
			(${rid}, 'INV-6', 'incidencia',  now(),                        now())
	`;

	await testSql`
		INSERT INTO system_notifications (restaurant_id, notification_type, message, payload, status, created_at) VALUES
			(${rid}, 'price_shock',     'Price shock on tomatoes', ${JSON.stringify({})},                 'pending',   now()),
			(${rid}, 'budget_overage',  'Budget exceeded',         ${JSON.stringify({ level: 'exceeded' })}, 'pending', now()),
			(${rid}, 'budget_overage',  'Budget warning',          ${JSON.stringify({ level: 'warning' })},  'pending', now()),
			(${rid}, 'low_stock_forecast', 'Low stock',            ${JSON.stringify({})},                 'dismissed', now())
	`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	if (userId) await testSql`DELETE FROM users WHERE id = ${userId}`;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('(app) layout load — behavior-preserving after the query reduction (issue #489)', () => {
	it('reports the invoice badge as unreviewed, non-deleted invoices only', async () => {
		const data = await runLoad();
		expect(data.invoiceBadge).toBe(3);
	});

	it('reports the reminder badge as incidencias plus exceeded budget alerts', async () => {
		const data = await runLoad();
		expect(data.reminderBadge).toBe(2);
	});

	it('reports quota usage as non-deleted invoices created this month', async () => {
		const data = await runLoad();
		expect(data.quotaUsed).toBe(4);
	});

	it('returns only pending notifications with explicit columns, no leaked fields', async () => {
		const data = await runLoad();
		const notifications = data.notifications as Array<Record<string, unknown>>;
		expect(notifications).toHaveLength(3);
		for (const n of notifications) {
			expect(Object.keys(n).sort()).toEqual(['createdAt', 'id', 'message', 'notificationType', 'payload']);
		}
		const types = notifications.map(n => n.notificationType).sort();
		expect(types).toEqual(['budget_overage', 'budget_overage', 'price_shock']);
	});

	it('exposes settings-derived fields from the merged settings lookup', async () => {
		const data = await runLoad();
		expect(data.hasCompletedOnboarding).toBe(true);
		expect(data.tutorialStep).toBe('done');
	});

	it('exposes the restaurant name from restaurants.name, not a settings row (issue #515)', async () => {
		const data = await runLoad();
		expect(data.restaurantName).toMatch(/^Test Restaurant layout-load/);
	});

	it('exposes the collapsed sidebar preference from the same merged settings lookup (issue #567)', async () => {
		const data = await runLoad();
		expect(data.sidebarCollapsed).toBe(true);
	});

	it('defaults the sidebar preference to expanded when no setting is stored', async () => {
		await testSql`DELETE FROM settings WHERE restaurant_id = ${rid} AND key = 'sidebar_collapsed'`;
		try {
			const data = await runLoad();
			expect(data.sidebarCollapsed).toBe(false);
		} finally {
			await testSql`
				INSERT INTO settings (restaurant_id, key, value) VALUES (${rid}, 'sidebar_collapsed', 'true')`;
		}
	});

	it('reflects a renamed restaurant immediately, with no settings row involved', async () => {
		await testSql`UPDATE restaurants SET name = ${'Renamed Bistro'} WHERE id = ${rid}`;
		try {
			const data = await runLoad();
			expect(data.restaurantName).toBe('Renamed Bistro');
			const [settingsRow] = await testSql`SELECT 1 FROM settings WHERE restaurant_id = ${rid} AND key = 'restaurant_name'`;
			expect(settingsRow).toBeUndefined();
		} finally {
			await testSql`UPDATE restaurants SET name = ${'Test Restaurant layout-load'} WHERE id = ${rid}`;
		}
	});

	it('lists the caller\'s locations, including the active restaurant, unlocked', async () => {
		const data = await runLoad();
		const locations = data.locations as Array<{ id: string; name: string; locked: boolean }>;
		const mine = locations.find(l => l.id === rid);
		expect(mine).toBeDefined();
		expect(mine?.locked).toBe(false);
	});

	it("never counts another tenant's invoices or notifications", async () => {
		const other = await createTestRestaurant('layout-load-other');
		try {
			await testSql`
				INSERT INTO invoices (restaurant_id, invoice_number, review_state, created_at, deleted_at)
				VALUES (${other.id}, 'OTHER-1', 'incidencia', now(), NULL)`;
			await testSql`
				INSERT INTO system_notifications (restaurant_id, notification_type, message, payload, status, created_at)
				VALUES (${other.id}, 'budget_overage', 'Other budget exceeded', ${JSON.stringify({ level: 'exceeded' })}, 'pending', now())`;

			const data = await runLoad();
			expect(data.invoiceBadge).toBe(3);
			expect(data.reminderBadge).toBe(2);
			expect(data.quotaUsed).toBe(4);
		} finally {
			await cleanupTestRestaurant(other.id);
		}
	});
});
