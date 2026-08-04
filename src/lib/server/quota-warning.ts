import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { invoices, restaurants, settings, userRestaurants } from './schema';
import { users } from './schema/auth';
import { sendEmail, quotaWarningEmail } from './email';
import { getMonthlyQuota } from './billing';

export const QUOTA_WARNING_THRESHOLD = 0.8;

const SENT_FLAG_KEY = 'quota_warning_sent_month';

export async function maybeSendQuotaWarning(restaurantId: string): Promise<void> {
	try {
		const tdb = forTenant(restaurantId);
		const currentMonth = new Date().toISOString().slice(0, 7);

		const limit = await getMonthlyQuota(restaurantId);
		if (limit === null) return;

		const [usedRow] = await db.select({ cnt: sql<number>`count(*)::int` })
			.from(invoices)
			.where(tdb.scope(invoices.restaurantId, and(
				isNull(invoices.deletedAt),
				sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM') = ${currentMonth}`,
			)));
		const used = usedRow?.cnt ?? 0;
		if (used < Math.ceil(limit * QUOTA_WARNING_THRESHOLD)) return;

		const claimed = await db.insert(settings)
			.values({ restaurantId, key: SENT_FLAG_KEY, value: currentMonth })
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: currentMonth },
				setWhere: sql`${settings.value} <> ${currentMonth}`,
			})
			.returning({ value: settings.value });
		if (claimed.length === 0) return;

		const [owner] = await db.select({ userId: userRestaurants.userId })
			.from(userRestaurants)
			.where(tdb.scope(userRestaurants.restaurantId, eq(userRestaurants.role, 'owner')))
			.limit(1);
		if (!owner) return;

		const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, owner.userId)).limit(1);
		const email = row?.email;
		if (!email) return;

		const [restaurant] = await db.select({ name: restaurants.name })
			.from(restaurants)
			.where(eq(restaurants.id, restaurantId));

		await sendEmail(quotaWarningEmail(email, restaurant?.name ?? 'tu restaurante', used, limit));
	} catch (err) {
		console.error('[quota-warning] check failed (non-fatal):', err);
	}
}
