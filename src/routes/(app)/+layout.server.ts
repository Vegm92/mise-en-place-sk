import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications, invoices, invoiceLineItems, settings, restaurants, userRestaurants, subscriptions } from '$lib/server/schema';
import { asc, eq, desc, and, gte, isNull, lt, sql } from 'drizzle-orm';
import { TIERS, resolveMonthlyQuota, type PlanTier } from '$lib/server/billing';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/onboarding');

	const tdb = forTenant(rid);
	const avisosWindowStart = new Date(Date.now() - 30 * 86_400_000);

	const [rawNotifs, invoiceBadgeRow, overdueBadgeRow, budgetExceededBadgeRow, quotaUsedRow, quotaLimitRow, planNameRow, restaurantNameRow, onboardingRow, restaurantRow, tutorialStepRow, locationRows, lowConfidenceBadgeRow, pendingPriceBadgeRow] = await Promise.all([
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
				sql`${systemNotifications.payload}::json->>'level' = 'exceeded'`
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

		db.select({ id: restaurants.id, name: restaurants.name })
			.from(userRestaurants)
			.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
			.where(eq(userRestaurants.userId, locals.user.id))
			.orderBy(asc(restaurants.name)),

		db.select({ cnt: sql<number>`COUNT(*)` })
			.from(invoices)
			.where(and(
				tdb.scope(invoices.restaurantId),
				isNull(invoices.deletedAt),
				lt(invoices.confidence, 0.85),
				gte(invoices.createdAt, avisosWindowStart),
			)),

		db.select({ cnt: sql<number>`COUNT(DISTINCT ${invoiceLineItems.invoiceId})` })
			.from(invoiceLineItems)
			.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
			.where(and(
				tdb.scope(invoiceLineItems.restaurantId),
				isNull(invoices.deletedAt),
				sql`${invoiceLineItems.unitPrice} IS NULL`,
			)),
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

	const entitlements = await locals.entitlements();
	const planTier: PlanTier = entitlements?.tier ?? 'trial';
	const tierConfig = TIERS[planTier];
	const usable = entitlements
		? (entitlements.access.allowed || entitlements.access.status === 'past_due')
		: true;

	const btdb = forTenant(entitlements?.billingRestaurantId ?? rid);
	const [subRow] = await db.select({
		status:           subscriptions.status,
		cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
		currentPeriodEnd: subscriptions.currentPeriodEnd,
	})
		.from(subscriptions)
		.where(btdb.scope(subscriptions.restaurantId))
		.limit(1);

	const avisosBadge =
		notifications.filter(n => n.notificationType === 'possible_duplicate_purchase' || n.notificationType === 'price_shock').length +
		Number(lowConfidenceBadgeRow[0]?.cnt ?? 0) +
		Number(pendingPriceBadgeRow[0]?.cnt ?? 0);

	return {
		user: {
			id:    locals.user.id,
			name:  locals.user.name ?? locals.user.email,
			email: locals.user.email,
		},
		restaurantId: rid,
		notifications,
		avisosBadge,
		invoiceBadge:            invoiceBadgeRow[0]?.cnt    ?? 0,
		reminderBadge:           Number(overdueBadgeRow[0]?.cnt ?? 0) + Number(budgetExceededBadgeRow[0]?.cnt ?? 0),
		quotaUsed:               quotaUsedRow[0]?.cnt        ?? 0,
		quotaLimit:              usable ? resolveMonthlyQuota(quotaLimitRow[0]?.value, planTier) : TIERS.trial.monthlyInvoiceQuota ?? 0,
		planName:                usable ? (planNameRow[0]?.value ?? tierConfig.name) : TIERS.trial.name,
		restaurantName:          restaurantNameRow[0]?.value ?? restaurantRow[0]?.name ?? '',
		locations: locationRows,
		hasCompletedOnboarding,
		tutorialStep,
		planTier,
		features: tierConfig.features,
		subscriptionStatus: subRow?.status ?? null,
		cancelAtPeriodEnd:  subRow?.cancelAtPeriodEnd ?? false,
		currentPeriodEnd:   subRow?.currentPeriodEnd?.toISOString() ?? null,
	};
};
