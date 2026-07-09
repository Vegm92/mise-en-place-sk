import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { stripe, createCheckoutSession, createPortalSession, getOrCreateCustomer, isAccessAllowed, TIERS, type PlanTier } from '$lib/server/billing';
import { db, forTenant } from '$lib/server/db';
import { subscriptions, restaurants, userRestaurants } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { claimRequest, releaseRequest, isValidKey } from '$lib/server/idempotency';
import { trackEvent } from '$lib/server/events';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || !locals.restaurantId) redirect(303, '/login');

	const rid = locals.restaurantId;
	const tdb = forTenant(rid);

	const [sub] = await db.select()
		.from(subscriptions)
		.where(tdb.scope(subscriptions.restaurantId))
		.limit(1);

	const [restaurant] = await db.select({ name: restaurants.name })
		.from(restaurants)
		.where(eq(restaurants.id, rid))
		.limit(1);

	const status = (sub?.status ?? 'trialing') as 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
	const trialEndsAt = sub?.trialEndsAt ?? null;
	const hasAccess = isAccessAllowed(status, trialEndsAt);
	const stripeConfigured = !!stripe;
	const currentTier = (sub?.planTier ?? 'trial') as PlanTier;

	return {
		status,
		trialEndsAt: trialEndsAt?.toISOString() ?? null,
		currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
		cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
		hasAccess,
		stripeConfigured,
		restaurantName: restaurant?.name ?? '',
		checkoutSuccess: url.searchParams.get('checkout') === 'success',
		upgradeFor: url.searchParams.get('upgrade'),
		currentTier,
		tiers: Object.entries(TIERS)
			.filter(([t]) => t !== 'trial')
			.map(([tier, config]) => ({
				tier,
				name: config.name,
				monthlyInvoiceQuota: config.monthlyInvoiceQuota,
				features: config.features,
				isCurrent: tier === currentTier,
			})),
	};
};

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

		// Refuse a second checkout when the tenant already has a live subscription
		// (issue #239). Without this, a user with an active plan — or one whose
		// checkout.session.completed webhook is still in flight — could complete a
		// second Checkout and hold two subscriptions charging the same card. Plan
		// changes go through the Customer Portal instead.
		const [existing] = await db.select({
			status: subscriptions.status,
			stripeSubscriptionId: subscriptions.stripeSubscriptionId,
			stripeCustomerId: subscriptions.stripeCustomerId,
		})
			.from(subscriptions)
			.where(tdb.scope(subscriptions.restaurantId))
			.limit(1);

		if (existing && (existing.status === 'active' || existing.stripeSubscriptionId)) {
			if (existing.stripeCustomerId) {
				const portalUrl = await createPortalSession(existing.stripeCustomerId, `${url.origin}/billing`);
				redirect(303, portalUrl);
			}
			redirect(303, '/billing');
		}

		// Idempotency key (issue #250) — a double-submit must not spin up two
		// Stripe checkout sessions. A replay lands back on /billing (a fresh page
		// load mints a new key for a genuine retry).
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
			const customerId = await getOrCreateCustomer(rid, email, restaurant?.name ?? rid);
			// checkout_started (issue #253) — lets checkout drop-off be measured
			// against plan_upgraded, which only fires on webhook success.
			trackEvent('checkout_started', rid, { tier });
			checkoutUrl = await createCheckoutSession(
				rid,
				customerId,
				tier,
				`${url.origin}/billing?checkout=success`,
				`${url.origin}/billing`,
				// Reuse the per-submit idempotency key as the Stripe idempotency key
				// so a proxy retry can't create a second Checkout session (#239).
				idemKey ?? undefined,
			);
		} catch (err) {
			// Release the key so the user can retry after a Stripe hiccup.
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

		const portalUrl = await createPortalSession(sub.stripeCustomerId, `${url.origin}/billing`);
		redirect(303, portalUrl);
	},
};
