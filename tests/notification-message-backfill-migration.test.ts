/**
 * Issue #536 — drizzle/0048_notification_message_backfill.sql cleans up any
 * existing system_notifications row whose message still carries the raw
 * `notificationType: value` machine string from before this fix (payload on
 * such rows predates the messageKey/messageVars scheme, so the render-time
 * resolver in notification-display.ts cannot repair them at read time —
 * these rows need the DB fixed instead).
 *
 * Runs the exact committed migration file against a scratch restaurant, so a
 * future edit to the SQL is caught here rather than only in production.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { systemNotifications } from '../src/lib/server/schema';
import { notificationMessage } from '../src/lib/notification-display';
import { testDb, testSql, createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './helpers/test-db';

const MIGRATION_SQL = readFileSync('drizzle/0048_notification_message_backfill.sql', 'utf8');

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

async function rowsFor(restaurantId: string) {
	return testDb.select({
		id: systemNotifications.id,
		notificationType: systemNotifications.notificationType,
		message: systemNotifications.message,
		payload: systemNotifications.payload,
	})
		.from(systemNotifications)
		.where(eq(systemNotifications.restaurantId, restaurantId));
}

describe.skipIf(!hasDbEnv)('0048_notification_message_backfill — legacy row cleanup (issue #536)', () => {
	it("strips the 'notificationType: ' prefix from a legacy row's message", async () => {
		const r = await createTestRestaurant('notif536-backfill-legacy');
		try {
			await testDb.insert(systemNotifications).values([
				{ restaurantId: r.id, notificationType: 'supplier_uncategorized', message: 'supplier_uncategorized: ESPECIAS LOCAL S.L.U.', payload: { supplierId: 1 }, status: 'pending' },
				{ restaurantId: r.id, notificationType: 'price_shock', message: 'price_shock: Tomate +20%', payload: { ingredient: 'Tomate' }, status: 'pending' },
			]);

			await testSql.unsafe(MIGRATION_SQL);

			const rows = await rowsFor(r.id);
			const byType = Object.fromEntries(rows.map((row) => [row.notificationType, row.message]));
			expect(byType.supplier_uncategorized).toBe('ESPECIAS LOCAL S.L.U.');
			expect(byType.price_shock).toBe('Tomate +20%');
			for (const row of rows) expect(row.message.startsWith(`${row.notificationType}: `)).toBe(false);
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('leaves an already-clean message untouched (post-#536 rows are a no-op)', async () => {
		const r = await createTestRestaurant('notif536-backfill-clean');
		try {
			await testDb.insert(systemNotifications).values({
				restaurantId: r.id, notificationType: 'supplier_uncategorized',
				message: "Clasifica a 'Mercado Central' para incluir su gasto en presupuestos y análisis por categoría.",
				payload: { supplierId: 2, messageKey: 'notif.msg.uncategorized', messageVars: { supplier: 'Mercado Central' } },
				status: 'pending',
			});

			await testSql.unsafe(MIGRATION_SQL);

			const [row] = await rowsFor(r.id);
			expect(row!.message).toBe("Clasifica a 'Mercado Central' para incluir su gasto en presupuestos y análisis por categoría.");
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('never touches a row from a different restaurant', async () => {
		const mine = await createTestRestaurant('notif536-backfill-mine');
		const other = await createTestRestaurant('notif536-backfill-other');
		try {
			await testDb.insert(systemNotifications).values([
				{ restaurantId: mine.id, notificationType: 'budget_overage', message: 'budget_overage: Carnes 120% (exceeded)', payload: {}, status: 'pending' },
				{ restaurantId: other.id, notificationType: 'budget_overage', message: 'budget_overage: Bebidas 90% (warning)', payload: {}, status: 'pending' },
			]);

			await testSql.unsafe(MIGRATION_SQL);

			const [mineRow] = await rowsFor(mine.id);
			const [otherRow] = await rowsFor(other.id);
			expect(mineRow!.message).toBe('Carnes 120% (exceeded)');
			expect(otherRow!.message).toBe('Bebidas 90% (warning)');
		} finally {
			await cleanupTestRestaurant(mine.id);
			await cleanupTestRestaurant(other.id);
		}
	});

	it('end to end: the render-time resolver shows the migrated, clean text for a pre-messageKey row', async () => {
		const r = await createTestRestaurant('notif536-backfill-resolver');
		const tivStub = (key: string, vars: Record<string, string | number>) => `${key}::${JSON.stringify(vars)}`;
		try {
			await testDb.insert(systemNotifications).values({
				restaurantId: r.id, notificationType: 'supplier_uncategorized',
				message: 'supplier_uncategorized: ESPECIAS LOCAL S.L.U.',
				payload: { supplierId: 3 },
				status: 'pending',
			});

			await testSql.unsafe(MIGRATION_SQL);

			const [row] = await testDb.select({
				message: systemNotifications.message,
				payload: systemNotifications.payload,
			}).from(systemNotifications).where(and(
				eq(systemNotifications.restaurantId, r.id),
				eq(systemNotifications.notificationType, 'supplier_uncategorized'),
			));

			const shown = notificationMessage(row!, tivStub);
			expect(shown).toBe('ESPECIAS LOCAL S.L.U.');
			expect(shown).not.toContain('supplier_uncategorized');
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});
