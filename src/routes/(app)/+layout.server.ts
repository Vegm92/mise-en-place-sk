import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications, invoices, settings, restaurants, subscriptions } from '$lib/server/schema';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { TIERS, type PlanTier } from '$lib/server/billing';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/onboarding');

	const tdb = forTenant(rid);

	const [rawNotifs, invoiceBadgeRow, reminderBadgeRow, quotaUsedRow, quotaLimitRow, planNameRow, restaurantNameRow, onboardingRow, restaurantRow, tutorialStepRow, subRow] = await Promise.all([
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
	]);

	const hasCompletedOnboarding = onboardingRow[0]?.value === 'true';
	// For existing users who never got a tutorial row, skip the tour silently
	const rawTutorialStep = tutorialStepRow[0]?.value;
	const tutorialStep = (rawTutorialStep ?? (hasCompletedOnboarding ? 'done' : '1')) as string;

	const notifications = rawNotifs.map((n) => ({
		...n,
		payload: n.payload ? JSON.parse(n.payload) : null,
	}));

	const planTier = (subRow?.[0]?.planTier ?? 'trial') as PlanTier;
	const tierConfig = TIERS[planTier];

	return {
		user: {
			id:    locals.user.id,
			name:  locals.user.user_metadata?.name ?? locals.user.email ?? '',
			email: locals.user.email ?? '',
		},
		restaurantId: rid,
		notifications,
		invoiceBadge:            invoiceBadgeRow[0]?.cnt    ?? 0,
		reminderBadge:           reminderBadgeRow[0]?.cnt   ?? 0,
		quotaUsed:               quotaUsedRow[0]?.cnt        ?? 0,
		quotaLimit:              quotaLimitRow[0]   ? Number(quotaLimitRow[0].value)  : tierConfig.monthlyInvoiceQuota ?? 150,
		planName:                planNameRow[0]?.value      ?? tierConfig.name,
		restaurantName:          restaurantNameRow[0]?.value ?? '',
		hasCompletedOnboarding,
		tutorialStep,
		planTier,
		features: tierConfig.features,
	};
};
