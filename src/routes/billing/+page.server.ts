import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { stripe, createCheckoutSession, createPortalSession, getOrCreateCustomer, isAccessAllowed } from '$lib/server/billing';
import { db } from '$lib/server/db';
import { subscriptions, restaurants, userRestaurants } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || !locals.restaurantId) redirect(303, '/login');

	const rid = locals.restaurantId;

	const [sub] = await db.select()
		.from(subscriptions)
		.where(eq(subscriptions.restaurantId, rid))
		.limit(1);

	const [restaurant] = await db.select({ name: restaurants.name })
		.from(restaurants)
		.where(eq(restaurants.id, rid))
		.limit(1);

	const status = (sub?.status ?? 'trialing') as 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
	const trialEndsAt = sub?.trialEndsAt ?? null;
	const hasAccess = isAccessAllowed(status, trialEndsAt);
	const stripeConfigured = !!stripe;

	return {
		status,
		trialEndsAt: trialEndsAt?.toISOString() ?? null,
		currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
		cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
		hasAccess,
		stripeConfigured,
		restaurantName: restaurant?.name ?? '',
		checkoutSuccess: url.searchParams.get('checkout') === 'success',
	};
};

export const actions: Actions = {
	checkout: async ({ locals, url }) => {
		if (!locals.user || !locals.restaurantId) redirect(303, '/login');
		if (!stripe) error(503, 'Billing not configured — contact support');

		const rid = locals.restaurantId;
		const email = locals.user.email ?? '';

		const [restaurant] = await db.select({ name: restaurants.name })
			.from(restaurants)
			.where(eq(restaurants.id, rid))
			.limit(1);

		const customerId = await getOrCreateCustomer(rid, email, restaurant?.name ?? rid);
		const checkoutUrl = await createCheckoutSession(
			rid,
			customerId,
			`${url.origin}/billing?checkout=success`,
			`${url.origin}/billing`,
		);

		redirect(303, checkoutUrl);
	},

	portal: async ({ locals, url }) => {
		if (!locals.user || !locals.restaurantId) redirect(303, '/login');
		if (!stripe) error(503, 'Billing not configured — contact support');

		const rid = locals.restaurantId;
		const [sub] = await db.select({ stripeCustomerId: subscriptions.stripeCustomerId })
			.from(subscriptions)
			.where(eq(subscriptions.restaurantId, rid))
			.limit(1);

		if (!sub?.stripeCustomerId) error(400, 'No billing account found. Subscribe first.');

		const portalUrl = await createPortalSession(sub.stripeCustomerId, `${url.origin}/billing`);
		redirect(303, portalUrl);
	},
};
