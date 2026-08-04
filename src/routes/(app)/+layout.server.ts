import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications, invoices, settings, restaurants, subscriptions, userRestaurants } from '$lib/server/schema';
import { asc, eq, desc, and, isNull, sql } from 'drizzle-orm';
import { TIERS, resolveMonthlyQuota, type PlanTier } from '$lib/server/billing';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/onboarding');

	const tdb = forTenant(rid);

	const [rawNotifs, invoiceBadgeRow, reminderBadgeRow, quotaUsedRow, quotaLimitRow, planNameRow, restaurantNameRow, onboardingRow, restaurantRow, tutorialStepRow, subRow, locationRows] = await Promise.all([
		db.select()
			.from(systemNotifications)
			.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.status, 'pending')))
			.orderBy(desc(systemNotifications.createdAt))
			.limit(20),

		db.select({ cnt: sql<number>`COUNT(*)` })
			.from(invoices)
			.where(and(tdb.scope(invoices.restaurantId), eq(invoices.status, 'pending'), isNull(invoices.deletedAt))),

		db.select({ cnt: sql<number>`COUNT(*)` })
			.from(invoices)
			.where(and(
				tdb.scope(invoices.restaurantId),
				eq(invoices.status, 'pending'),
				isNull(invoices.deletedAt),
				sql`${invoices.dueDate} BETWEEN CURRENT_DATE::text AND (CURRENT_DATE + INTERVAL '7 days')::text`
			)),

		db.select({ cnt: sql<number>`COUNT(*)` })
			.from(invoices)
			.where(and(
				tdb.scope(invoices.restaurantId),
				isNull(invoices.deletedAt),
				sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`
			)),

		db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'plan_quota'))),

		db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'plan_name'))),

		db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'restaurant_name'))),

		db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'has_completed_onboarding'))),

		db.select({ name: restaurants.name })
			.from(restaurants)
			.where(eq(restaurants.id, rid)),

		db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'tutorial_step'))),

		db.select({ planTier: subscriptions.planTier })
			.from(subscriptions)
			.where(tdb.scope(subscriptions.restaurantId))
			.limit(1),

		db.select({ id: restaurants.id, name: restaurants.name })
			.from(userRestaurants)
			.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
			.where(eq(userRestaurants.userId, locals.user.id))
			.orderBy(asc(restaurants.name)),
	]);

	const hasCompletedOnboarding = onboardingRow[0]?.value === 'true';
	const rawTutorialStep = tutorialStepRow[0]?.value;
	const tutorialStep = (rawTutorialStep ?? (hasCompletedOnboarding ? 'done' : '1')) as string;

	const notifications = rawNotifs.flatMap((n) => {
		let payload: unknown = null;
		if (n.payload) {
			try { payload = JSON.parse(n.payload); } catch { return []; }
		}
		return [{ ...n, payload }];
	});

	const planTier = (subRow?.[0]?.planTier ?? 'trial') as PlanTier;
	const tierConfig = TIERS[planTier];

	return {
		user: {
			id:    locals.user.id,
			name:  locals.user.name ?? locals.user.email,
			email: locals.user.email,
		},
		restaurantId: rid,
		notifications,
		invoiceBadge:            invoiceBadgeRow[0]?.cnt    ?? 0,
		reminderBadge:           reminderBadgeRow[0]?.cnt   ?? 0,
		quotaUsed:               quotaUsedRow[0]?.cnt        ?? 0,
		quotaLimit:              resolveMonthlyQuota(quotaLimitRow[0]?.value, planTier),
		planName:                planNameRow[0]?.value      ?? tierConfig.name,
		restaurantName:          restaurantNameRow[0]?.value ?? restaurantRow[0]?.name ?? '',
		locations: locationRows,
		hasCompletedOnboarding,
		tutorialStep,
		planTier,
		features: tierConfig.features,
	};
};
