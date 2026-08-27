/**
 * Admin bootstrap seed (`AUTH_ADMIN_EMAIL`/`AUTH_ADMIN_PASSWORD`).
 *
 * Issue #486: `seedAdminUser` created a restaurant + membership with no
 * `subscriptions` row, so any restaurant born from this path fell into the
 * "no subscription row" gap that used to make `getAccessState` fail open.
 * This mirrors onboarding's own insert and proves the seeded restaurant gets
 * a real dated trial row, not a bare restaurant.
 *
 * `AUTH_ADMIN_EMAIL`/`_PASSWORD`/`_RESTAURANT_NAME` are read once at module
 * import (like `STRIPE_SECRET_KEY` in billing.ts), so they are set via
 * `vi.hoisted` before the import, same convention as billing-price-config.test.ts.
 * db is mocked (table-name-aware, records what each insert wrote) so this
 * runs without a database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';

vi.hoisted(() => {
	process.env.AUTH_ADMIN_EMAIL = 'admin@casa-lua.test';
	process.env.AUTH_ADMIN_PASSWORD = 'a-strong-password';
	process.env.AUTH_ADMIN_RESTAURANT_NAME = 'Casa Lua';
});

const { state } = vi.hoisted(() => ({
	state: {
		existingUsers: [] as unknown[],
		inserts: {} as Record<string, Record<string, unknown>[]>,
	},
}));

vi.mock('../src/lib/server/db', () => {
	const db = {
		select: () => ({
			from: (table: never) => ({
				where: () => ({
					limit: () => Promise.resolve(getTableName(table) === 'users' ? state.existingUsers : []),
				}),
			}),
		}),
		insert: (table: never) => {
			const name = getTableName(table);
			return {
				values: (raw: Record<string, unknown> | Record<string, unknown>[]) => {
					const rows = Array.isArray(raw) ? raw : [raw];
					(state.inserts[name] ??= []).push(...rows);
					return {
						returning: () => Promise.resolve(rows.map((row, i) => ({ id: `${name}-${i}`, founder: false, ...row }))),
					};
				},
			};
		},
	};
	return { db };
});

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed-password') } }));

import { seedAdminUser } from '../src/lib/server/auth-seed';
import { TRIAL_DAYS } from '../src/lib/server/billing';

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
	state.existingUsers = [];
	state.inserts = {};
});

describe('seedAdminUser', () => {
	it('creates a subscription row alongside the seeded restaurant (issue #486)', async () => {
		await seedAdminUser();

		expect(state.inserts.restaurants).toHaveLength(1);
		expect(state.inserts.subscriptions).toHaveLength(1);

		const restaurant = state.inserts.restaurants![0];
		const sub = state.inserts.subscriptions![0];
		expect(sub.restaurantId).toBe('restaurants-0');
		expect(restaurant.name).toBe('Casa Lua');
		expect(sub.status).toBe('trialing');
		expect(sub.trialEndsAt).toBeInstanceOf(Date);

		const expiresIn = (sub.trialEndsAt as Date).getTime() - Date.now();
		expect(expiresIn).toBeGreaterThan((TRIAL_DAYS - 1) * DAY_MS);
		expect(expiresIn).toBeLessThanOrEqual(TRIAL_DAYS * DAY_MS);
	});

	it('inserts the subscription after the restaurant and membership exist', async () => {
		await seedAdminUser();

		const order = Object.keys(state.inserts);
		expect(order.indexOf('subscriptions')).toBeGreaterThan(order.indexOf('restaurants'));
		expect(order.indexOf('subscriptions')).toBeGreaterThan(order.indexOf('user_restaurants'));
	});

	it('does nothing when the admin user already exists', async () => {
		state.existingUsers = [{ id: 'existing-user' }];

		await seedAdminUser();

		expect(state.inserts.subscriptions).toBeUndefined();
		expect(state.inserts.restaurants).toBeUndefined();
	});
});
