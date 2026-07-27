/**
 * "Cuota próxima a agotarse" alert (issue #202): when a restaurant's monthly
 * invoice usage crosses QUOTA_WARNING_THRESHOLD of its plan quota, email the
 * owner once per calendar month. Called fire-and-forget after invoice saves —
 * must never throw into the save path.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { invoices, restaurants, settings, userRestaurants } from './schema';
import { createSupabaseAdminClient } from './supabase';
import { sendEmail, quotaWarningEmail } from './email';
import { getMonthlyQuota } from './billing';

export const QUOTA_WARNING_THRESHOLD = 0.8;

const SENT_FLAG_KEY = 'quota_warning_sent_month';

export async function maybeSendQuotaWarning(restaurantId: string): Promise<void> {
	try {
		const tdb = forTenant(restaurantId);
		const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

		// Shared quota convention (issue #295) — null means unlimited, and an
		// unlimited plan can never approach its cap.
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

		// Send at most once per month per restaurant. Claim the month flag
		// BEFORE sending (guarded upsert, issue #249) — two concurrent invoice
		// saves at the threshold would otherwise both pass a read-then-send
		// check and email the owner twice.
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

		const { data } = await createSupabaseAdminClient().auth.admin.getUserById(owner.userId);
		const email = data?.user?.email;
		if (!email) return;

		const [restaurant] = await db.select({ name: restaurants.name })
			.from(restaurants)
			.where(eq(restaurants.id, restaurantId));

		await sendEmail(quotaWarningEmail(email, restaurant?.name ?? 'tu restaurante', used, limit));
	} catch (err) {
		console.error('[quota-warning] check failed (non-fatal):', err);
	}
}
