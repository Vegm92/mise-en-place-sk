import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications, invoices, settings, restaurants, userRestaurants } from '$lib/server/schema';
import { asc, eq, desc, and, isNull, sql } from 'drizzle-orm';
import { TIERS, syncSubscriptionFromStripe, type PlanTier } from '$lib/server/billing';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/onboarding');

	if (url.pathname === '/billing') await syncSubscriptionFromStripe(rid);

	const tdb = forTenant(rid);

	const [rawNotifs, invoiceBadgeRow, overdueBadgeRow, budgetExceededBadgeRow, quotaUsedRow, restaurantNameRow, onboardingRow, restaurantRow, tutorialStepRow, locationRows, entitlements] = await Promise.all([
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
				sql`${invoices.status} IN ('pending', 'accepted')`,
				isNull(invoices.deletedAt),
				sql`${invoices.dueDate} < CURRENT_DATE`
			)),

		db.select({ cnt: sql<number>`COUNT(*)` })
			.from(systemNotifications)
			.where(tdb.scope(systemNotifications.restaurantId, and(
				eq(systemNotifications.status, 'pending'),
				eq(systemNotifications.notificationType, 'budget_overage'),
				sql`${systemNotifications.payload}->>'level' = 'exceeded'`
			))),

		db.select({ cnt: sql<number>`COUNT(*)` })
			.from(invoices)
			.where(and(
				tdb.scope(invoices.restaurantId),
				isNull(invoices.deletedAt),
				sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`
			)),

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

		db.select({ id: restaurants.id, name: restaurants.name })
			.from(userRestaurants)
			.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
			.where(eq(userRestaurants.userId, locals.user.id))
			.orderBy(asc(restaurants.name)),
		locals.entitlements(),
	]);

	const hasCompletedOnboarding = onboardingRow[0]?.value === 'true';
	const rawTutorialStep = tutorialStepRow[0]?.value;
	const tutorialStep = (rawTutorialStep ?? (hasCompletedOnboarding ? 'done' : '1')) as string;

	const notifications = rawNotifs;

	const planTier: PlanTier = entitlements?.tier ?? 'trial';
	const tierConfig = TIERS[planTier];
	const usable = entitlements
		? (entitlements.access.allowed || entitlements.access.status === 'past_due')
		: true;

	const subscription = entitlements?.subscription ?? null;

	return {
		user: {
			id:    locals.user.id,
			name:  locals.user.name ?? locals.user.email,
			email: locals.user.email,
		},
		restaurantId: rid,
		notifications,
		invoiceBadge:            invoiceBadgeRow[0]?.cnt    ?? 0,
		reminderBadge:           Number(overdueBadgeRow[0]?.cnt ?? 0) + Number(budgetExceededBadgeRow[0]?.cnt ?? 0),
		quotaUsed:               quotaUsedRow[0]?.cnt        ?? 0,
		quotaLimit:              usable ? entitlements?.monthlyQuota ?? null : TIERS.trial.monthlyInvoiceQuota ?? 0,
		planNameKey:             usable ? tierConfig.nameKey : TIERS.trial.nameKey,
		restaurantName:          restaurantNameRow[0]?.value ?? restaurantRow[0]?.name ?? '',
		locations: locationRows.map(loc => ({ ...loc, locked: locals.lockedRestaurantIds.includes(loc.id) })),
		hasCompletedOnboarding,
		tutorialStep,
		planTier,
		features: tierConfig.features,
		subscriptionStatus: subscription?.status ?? null,
		cancelAtPeriodEnd:  subscription?.cancelAtPeriodEnd ?? false,
		currentPeriodEnd:   subscription?.currentPeriodEnd?.toISOString() ?? null,
	};
};
