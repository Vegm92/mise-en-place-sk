/**
 * DB-backed tests for issue #497 — system_notifications.payload migrated from
 * text (queried with ::json casts) to jsonb.
 *
 * Covers the layout's budget-overage level filter running natively against
 * jsonb (no ::json cast, served by the partial index), and that writing and
 * reading payload through Drizzle round-trips a plain object with no
 * JSON.stringify/JSON.parse anywhere in the path.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { systemNotifications } from '../src/lib/server/schema';
import { forTenant } from '../src/lib/server/tenant';

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('sysnotif-payload');
	rid = r.id;
});

afterEach(async () => {
	if (!hasDbEnv) return;
	await testSql`DELETE FROM system_notifications WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

/** The exact filter shape (app)/+layout.server.ts runs on every navigation. */
async function budgetExceededCount(restaurantId: string): Promise<number> {
	const tdb = forTenant(restaurantId);
	const [row] = await testDb
		.select({ cnt: sql<number>`COUNT(*)` })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			eq(systemNotifications.status, 'pending'),
			eq(systemNotifications.notificationType, 'budget_overage'),
			sql`${systemNotifications.payload}->>'level' = 'exceeded'`,
		)));
	return Number(row?.cnt ?? 0);
}

describe.skipIf(!hasDbEnv)('system_notifications.payload — jsonb level filter (issue #497)', () => {
	it('counts only pending budget_overage rows whose payload level is exceeded', async () => {
		await testDb.insert(systemNotifications).values([
			{ restaurantId: rid, notificationType: 'budget_overage', message: 'a', status: 'pending', payload: { category: 'Carnes', level: 'exceeded' } },
			{ restaurantId: rid, notificationType: 'budget_overage', message: 'b', status: 'pending', payload: { category: 'Pescados', level: 'warning' } },
			{ restaurantId: rid, notificationType: 'budget_overage', message: 'c', status: 'sent', payload: { category: 'Lacteos', level: 'exceeded' } },
			{ restaurantId: rid, notificationType: 'price_shock', message: 'd', status: 'pending', payload: { level: 'exceeded' } },
		]);

		expect(await budgetExceededCount(rid)).toBe(1);
	});

	it('never throws on a row whose payload has no level key', async () => {
		await testDb.insert(systemNotifications).values({
			restaurantId: rid, notificationType: 'budget_overage', message: 'no level', status: 'pending', payload: { category: 'Carnes' },
		});

		await expect(budgetExceededCount(rid)).resolves.toBe(0);
	});

	it('never throws with a mix of matching and non-matching restaurants (payload->> without ::json)', async () => {
		const other = await createTestRestaurant('sysnotif-payload-other');
		try {
			await testDb.insert(systemNotifications).values([
				{ restaurantId: rid, notificationType: 'budget_overage', message: 'mine', status: 'pending', payload: { category: 'Carnes', level: 'exceeded' } },
				{ restaurantId: other.id, notificationType: 'budget_overage', message: 'theirs', status: 'pending', payload: { category: 'Carnes', level: 'exceeded' } },
			]);

			expect(await budgetExceededCount(rid)).toBe(1);
			expect(await budgetExceededCount(other.id)).toBe(1);
		} finally {
			await cleanupTestRestaurant(other.id);
		}
	});
});

describe.skipIf(!hasDbEnv)('system_notifications.payload — write/read round trip (issue #497)', () => {
	it('reads back exactly what was written, as an object — no double encoding', async () => {
		const original = { ingredient: 'Merluza', deviationPct: 22.5, messageVars: { pct: 22.5 }, nested: { ok: true } };

		await testDb.insert(systemNotifications).values({
			restaurantId: rid, notificationType: 'price_shock', message: 'round trip', status: 'pending', payload: original,
		});

		const [row] = await testDb.select({ payload: systemNotifications.payload })
			.from(systemNotifications)
			.where(and(eq(systemNotifications.restaurantId, rid), eq(systemNotifications.notificationType, 'price_shock')));

		expect(row.payload).toEqual(original);
		expect(typeof row.payload).toBe('object');
	});

	it('round-trips a null payload as null, not the string "null"', async () => {
		await testDb.insert(systemNotifications).values({
			restaurantId: rid, notificationType: 'file_uploaded', message: 'no payload', status: 'logged', payload: null,
		});

		const [row] = await testDb.select({ payload: systemNotifications.payload })
			.from(systemNotifications)
			.where(and(eq(systemNotifications.restaurantId, rid), eq(systemNotifications.notificationType, 'file_uploaded')));

		expect(row.payload).toBeNull();
	});

	it('fails loudly on malformed JSON rather than silently accepting it (mirrors the migration USING cast)', async () => {
		await expect(testSql`
			INSERT INTO system_notifications (restaurant_id, notification_type, message, payload, status)
			VALUES (${rid}, 'price_shock', 'bad json', 'not valid json'::text::jsonb, 'pending')
		`).rejects.toThrow(/invalid input syntax for type json/);
	});
});
