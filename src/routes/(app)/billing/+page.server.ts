import { redirect, error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { stripe, billingRestaurantId, countGroupLocations, createCheckoutSession, createPortalSession, getOrCreateCustomer, isAccessAllowed, isTierAvailable, ownedActiveSubscriptions, switchTier, StaleCustomerError, TIERS, type PlanTier } from '$lib/server/billing';
import { db, forTenant } from '$lib/server/db';
import { subscriptions, restaurants } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { claimRequest, releaseRequest, isValidKey } from '$lib/server/idempotency';
import { trackEvent } from '$lib/server/events';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	if (!locals.user || !locals.restaurantId) redirect(303, '/login');

	await parent();

	const rid = locals.restaurantId;
	const entitlements = await locals.entitlements();
	const billingRid = entitlements?.billingRestaurantId ?? rid;
	const billingTdb = forTenant(billingRid);
	const groupLocations = await countGroupLocations(billingRid);

	const [sub] = await db.select()
		.from(subscriptions)
		.where(billingTdb.scope(subscriptions.restaurantId))
		.limit(1);

	const [restaurant] = await db.select({ name: restaurants.name })
		.from(restaurants)
		.where(eq(restaurants.id, rid))
		.limit(1);

	const status = (sub?.status ?? 'trialing') as 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'incomplete';
	const trialEndsAt = sub?.trialEndsAt ?? null;
	const hasAccess = isAccessAllowed(status, trialEndsAt);
	const stripeConfigured = !!stripe;
	const currentTier = (sub?.planTier ?? 'trial') as PlanTier;
	const hasSubscription = !!sub?.stripeSubscriptionId;

	return {
		title: 'billing.title',
		status,
		trialEndsAt: trialEndsAt?.toISOString() ?? null,
		currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
		cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
		hasAccess,
		hasSubscription,
		stripeConfigured,
		restaurantName: restaurant?.name ?? '',
		checkoutSuccess: url.searchParams.get('checkout') === 'success',
		upgradeFor: url.searchParams.get('upgrade'),
		currentTier,
		currentTierNameKey: TIERS[currentTier].nameKey,
		locationsUsed:   Math.min(groupLocations, TIERS[currentTier].maxLocations),
		lockedLocations: Math.max(0, groupLocations - TIERS[currentTier].maxLocations),
		trialTier: {
			monthlyInvoiceQuota: TIERS.trial.monthlyInvoiceQuota,
			maxLocations: TIERS.trial.maxLocations,
			maxRecipes: TIERS.trial.maxRecipes,
			features: TIERS.trial.features,
		},
		tiers: Object.entries(TIERS)
			.filter(([t]) => t !== 'trial')
			.map(([tier, config]) => ({
				tier,
				nameKey: config.nameKey,
				monthlyInvoiceQuota: config.monthlyInvoiceQuota,
				maxLocations: config.maxLocations,
				maxRecipes: config.maxRecipes,
				features: config.features,
				isCurrent: tier === currentTier,
				available: isTierAvailable(tier as PlanTier),
			})),
	};
};

async function getPortalOrBillingUrl(customerId: string | null | undefined, origin: string): Promise<string> {
	if (customerId) return createPortalSession(customerId, `${origin}/billing`);
	return '/billing';
}

async function clearStaleCustomer(rid: string): Promise<void> {
	const tdb = forTenant(rid);
	await db.update(subscriptions)
		.set({ stripeCustomerId: null })
		.where(tdb.scope(subscriptions.restaurantId));
}

async function redirectExistingSubscriber(
	rid: string,
	stripeCustomerId: string | null,
	origin: string,
): Promise<never> {
	if (stripeCustomerId) {
		try {
			redirect(303, await createPortalSession(stripeCustomerId, `${origin}/billing`));
		} catch (err) {
			if (!(err instanceof StaleCustomerError)) throw err;
			await clearStaleCustomer(rid);
		}
	}
	redirect(303, '/billing');
}

async function createCheckoutUrl(args: {
	rid: string;
	email: string;
	restaurantName: string;
	tier: PlanTier;
	origin: string;
	idemKey: string | null;
	userId: string;
}): Promise<string> {
	const successUrl = `${args.origin}/billing/confirm?session_id={CHECKOUT_SESSION_ID}`;
	const cancelUrl = `${args.origin}/billing`;
	let customerId = await getOrCreateCustomer(args.rid, args.email, args.restaurantName);
	trackEvent('checkout_started', args.rid, { tier: args.tier });
	try {
		return await createCheckoutSession(
			args.rid, customerId, args.tier, successUrl, cancelUrl, args.idemKey ?? undefined, args.userId,
		);
	} catch (err) {
		if (!(err instanceof StaleCustomerError)) throw err;
		await clearStaleCustomer(args.rid);
		customerId = await getOrCreateCustomer(args.rid, args.email, args.restaurantName);
		return createCheckoutSession(
			args.rid, customerId, args.tier, successUrl, cancelUrl, undefined, args.userId,
		);
	}
}

export const actions: Actions = {
	checkout: async ({ locals, url, request }) => {
		if (!locals.user || !locals.restaurantId) redirect(303, '/login');
		if (!stripe) error(503, 'Billing not configured — contact support');

		const rid = locals.restaurantId;
		const tdb = forTenant(rid);
		const email = locals.user.email ?? '';

		const formData = await request.formData();
		const tierParam = (formData.get('tier') as string | null) ?? 'starter';
		const tier = (tierParam in TIERS && tierParam !== 'trial' ? tierParam : 'starter') as PlanTier;

		if (!isTierAvailable(tier)) {
			console.error(`[billing] checkout blocked: STRIPE_PRICE_ID_${tier.toUpperCase()} is not configured`);
			return fail(503, { error: 'billing.err.tierUnavailable' });
		}

		const rootRid = await billingRestaurantId(rid);
		const ownedActive = await ownedActiveSubscriptions(locals.user.id);
		const currentActive = ownedActive.find(s => s.restaurantId === rootRid);
		const otherActive = ownedActive.find(s => s.restaurantId !== rootRid);
		if (otherActive) {
			return fail(409, { error: 'billing.err.oneSubscription' });
		}

		const [existing] = await db.select({
			status: subscriptions.status,
			stripeSubscriptionId: subscriptions.stripeSubscriptionId,
			stripeCustomerId: subscriptions.stripeCustomerId,
		})
			.from(subscriptions)
			.where(tdb.scope(subscriptions.restaurantId))
			.limit(1);

		if (existing && (existing.status === 'active' || existing.stripeSubscriptionId)) {
			await redirectExistingSubscriber(rid, existing.stripeCustomerId, url.origin);
		}

		if (currentActive) {
			redirect(303, await getPortalOrBillingUrl(currentActive.stripeCustomerId, url.origin));
		}

		const idemKeyRaw = formData.get('idempotency_key');
		const idemKey = isValidKey(idemKeyRaw) ? idemKeyRaw : null;
		if (idemKey && !(await claimRequest(idemKey, rid))) {
			redirect(303, '/billing');
		}

		const [restaurant] = await db.select({ name: restaurants.name })
			.from(restaurants)
			.where(eq(restaurants.id, rid))
			.limit(1);

		let checkoutUrl: string;
		try {
			let customerId = await getOrCreateCustomer(rid, email, restaurant?.name ?? rid);
			trackEvent('checkout_started', rid, { tier });
			try {
				checkoutUrl = await createCheckoutSession(
					rid,
					customerId,
					tier,
					`${url.origin}/billing/confirm?session_id={CHECKOUT_SESSION_ID}`,
					`${url.origin}/billing`,
					idemKey ?? undefined,
					locals.user.id,
				);
			} catch (err) {
				if (!(err instanceof StaleCustomerError)) throw err;
				await db.update(subscriptions).set({ stripeCustomerId: null }).where(tdb.scope(subscriptions.restaurantId));
				customerId = await getOrCreateCustomer(rid, email, restaurant?.name ?? rid, true);
				checkoutUrl = await createCheckoutSession(
					rid,
					customerId,
					tier,
					`${url.origin}/billing/confirm?session_id={CHECKOUT_SESSION_ID}`,
					`${url.origin}/billing`,
					undefined,
					locals.user.id,
				);
			}
		} catch (err) {
			if (idemKey) await releaseRequest(idemKey);
			throw err;
		}

		redirect(303, checkoutUrl);
	},

	portal: async ({ locals, url }) => {
		if (!locals.user || !locals.restaurantId) redirect(303, '/login');
		if (!stripe) error(503, 'Billing not configured — contact support');

		const rid = locals.restaurantId;
		const tdb = forTenant(rid);
		const [sub] = await db.select({ stripeCustomerId: subscriptions.stripeCustomerId })
			.from(subscriptions)
			.where(tdb.scope(subscriptions.restaurantId))
			.limit(1);

		if (!sub?.stripeCustomerId) error(400, 'No billing account found. Subscribe first.');

		try {
			redirect(303, await createPortalSession(sub.stripeCustomerId, `${url.origin}/billing`));
		} catch (err) {
			if (!(err instanceof StaleCustomerError)) throw err;
			await db.update(subscriptions)
				.set({ stripeCustomerId: null })
				.where(tdb.scope(subscriptions.restaurantId));
			redirect(303, '/billing');
		}
	},

	switch: async ({ locals, request }) => {
		if (!locals.user || !locals.restaurantId) redirect(303, '/login');
		if (!stripe) error(503, 'Billing not configured — contact support');

		const rid = locals.restaurantId;
		const tdb = forTenant(rid);

		const formData = await request.formData();
		const tierParam = (formData.get('tier') as string | null) ?? '';
		const tier = (tierParam in TIERS && tierParam !== 'trial' ? tierParam : null) as PlanTier | null;
		if (!tier || !isTierAvailable(tier)) return fail(400, { error: 'billing.err.tierUnavailable' });

		const [sub] = await db.select({
			stripeSubscriptionId: subscriptions.stripeSubscriptionId,
			planTier: subscriptions.planTier,
		})
			.from(subscriptions)
			.where(tdb.scope(subscriptions.restaurantId))
			.limit(1);

		if (!sub?.stripeSubscriptionId) return fail(400, { error: 'billing.err.noSubscription' });
		if (tier === sub.planTier) redirect(303, '/billing');

		try {
			await switchTier(rid, tier);
		} catch (err) {
			console.error(`[billing] switch failed for ${rid}:`, err);
			return fail(500, { error: 'billing.err.switchFailed' });
		}
		trackEvent('plan_switched', rid, { tier });
		redirect(303, '/billing');
	},
};
