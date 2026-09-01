import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, forTenant, runAsSystem } from '$lib/server/db';
import { systemNotifications, invoices, settings, restaurants, userRestaurants } from '$lib/server/schema';
import { asc, eq, desc, and, gte, inArray, isNull, sql } from 'drizzle-orm';
import { TIERS, syncSubscriptionFromStripe, type PlanTier } from '$lib/server/billing';
import { getBetaFeatureFlags } from '$lib/server/feature-flags';
import { getMonthlyUsage } from '$lib/server/llm-quota';
import { periodRange } from '$lib/server/period-range';
import { getOpenBatchesForRestaurant } from '$lib/server/batch';

const LAYOUT_SETTINGS_KEYS = ['has_completed_onboarding', 'tutorial_step', 'sidebar_collapsed'] as const;

type InvoiceBadgeCounts = {
	invoice_badge: number;
	incidencia_badge: number;
	budget_exceeded_badge: number;
} & Record<string, unknown>;

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/onboarding');

	if (url.pathname === '/billing') await syncSubscriptionFromStripe(rid);

	const tdb = forTenant(rid);

	const quotaUsedPromise = getMonthlyUsage(rid);

	const [rawNotifs, invoiceBadgeRows, settingsRows, locationRows, entitlements, betaFeatures, openBatches] = await Promise.all([
		db.select({
			id:               systemNotifications.id,
			notificationType: systemNotifications.notificationType,
			message:          systemNotifications.message,
			payload:          systemNotifications.payload,
			createdAt:        systemNotifications.createdAt,
		})
			.from(systemNotifications)
			.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.status, 'pending')))
			.orderBy(desc(systemNotifications.createdAt))
			.limit(20),

		db.execute<InvoiceBadgeCounts>(sql`
			SELECT
				COUNT(*) FILTER (WHERE ${invoices.reviewState} <> 'revisado')::int AS invoice_badge,
				COUNT(*) FILTER (WHERE ${invoices.reviewState} = 'incidencia')::int AS incidencia_badge,
				(SELECT COUNT(*)::int FROM ${systemNotifications}
					WHERE ${systemNotifications.restaurantId} = ${tdb.rid}
					  AND ${systemNotifications.status} = 'pending'
					  AND ${systemNotifications.notificationType} = 'budget_overage'
					  AND ${systemNotifications.payload}->>'level' = 'exceeded'
				) AS budget_exceeded_badge
			FROM ${invoices}
			WHERE ${invoices.restaurantId} = ${tdb.rid} AND ${invoices.deletedAt} IS NULL
		`),

		db.select({ key: settings.key, value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, inArray(settings.key, LAYOUT_SETTINGS_KEYS))),

		runAsSystem(() => db.select({ id: restaurants.id, name: restaurants.name })
			.from(userRestaurants)
			.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
			.where(eq(userRestaurants.userId, locals.user!.id))
			.orderBy(asc(restaurants.name))),
		locals.entitlements(),
		getBetaFeatureFlags(),
		getOpenBatchesForRestaurant(rid),
	]);

	const quotaUsed = await quotaUsedPromise;
	const invoiceBadgeCounts = invoiceBadgeRows[0] as InvoiceBadgeCounts | undefined;
	const settingsMap = new Map(settingsRows.map(row => [row.key, row.value]));
	const hasCompletedOnboarding = settingsMap.get('has_completed_onboarding') === 'true';
	const rawTutorialStep = settingsMap.get('tutorial_step');
	const tutorialStep = (rawTutorialStep ?? (hasCompletedOnboarding ? 'done' : '1')) as string;
	const currentLocation = locationRows.find(loc => loc.id === rid);

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
		invoiceBadge:            Number(invoiceBadgeCounts?.invoice_badge ?? 0),
		reminderBadge:           Number(invoiceBadgeCounts?.incidencia_badge ?? 0) + Number(invoiceBadgeCounts?.budget_exceeded_badge ?? 0),
		quotaUsed:               quotaUsed,
		quotaLimit:              usable ? entitlements?.monthlyQuota ?? null : TIERS.trial.monthlyInvoiceQuota ?? 0,
		planNameKey:             usable ? tierConfig.nameKey : TIERS.trial.nameKey,
		restaurantName:          currentLocation?.name ?? '',
		locations: locationRows.map(loc => ({ ...loc, locked: locals.lockedRestaurantIds.includes(loc.id) })),
		hasCompletedOnboarding,
		tutorialStep,
		sidebarCollapsed: settingsMap.get('sidebar_collapsed') === 'true',
		planTier,
		features: tierConfig.features,
		betaFeatures: { recipes: betaFeatures.recipes, budgets: betaFeatures.budgets },
		openBatches: openBatches.map(b => ({ batchId: b.batchId, itemCount: b.itemCount })),
		trialExpired:       entitlements?.access.trialExpired ?? false,
		subscriptionStatus: subscription?.status ?? null,
		cancelAtPeriodEnd:  subscription?.cancelAtPeriodEnd ?? false,
		currentPeriodEnd:   subscription?.currentPeriodEnd?.toISOString() ?? null,
		...periodRange(url),
	};
};
