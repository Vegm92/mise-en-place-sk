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

export const QUOTA_WARNING_THRESHOLD = 0.8;

const SENT_FLAG_KEY = 'quota_warning_sent_month';

export async function maybeSendQuotaWarning(restaurantId: string): Promise<void> {
	try {
		const tdb = forTenant(restaurantId);
		const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

		const [quotaRow] = await db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'plan_quota')));
		const limit = quotaRow ? Number(quotaRow.value) : NaN;
		if (!Number.isFinite(limit) || limit <= 0) return;

		const [usedRow] = await db.select({ cnt: sql<number>`count(*)::int` })
			.from(invoices)
			.where(tdb.scope(invoices.restaurantId, and(
				isNull(invoices.deletedAt),
				sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM') = ${currentMonth}`,
			)));
		const used = usedRow?.cnt ?? 0;
		if (used < Math.ceil(limit * QUOTA_WARNING_THRESHOLD)) return;

		// Send at most once per month per restaurant.
		const [sentRow] = await db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, SENT_FLAG_KEY)));
		if (sentRow?.value === currentMonth) return;

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

		await db.insert(settings)
			.values({ restaurantId, key: SENT_FLAG_KEY, value: currentMonth })
			.onConflictDoUpdate({
				target: [settings.restaurantId, settings.key],
				set: { value: currentMonth },
			});
	} catch (err) {
		console.error('[quota-warning] check failed (non-fatal):', err);
	}
}
