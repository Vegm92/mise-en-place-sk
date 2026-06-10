/**
 * Stripe billing integration.
 * Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_ID in env.
 * Without STRIPE_SECRET_KEY the module is a no-op (safe for dev).
 */
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { subscriptions, restaurants } from './schema';
import { eq } from 'drizzle-orm';

const secretKey = env.STRIPE_SECRET_KEY ?? '';
export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;

export const PRICE_ID    = env.STRIPE_PRICE_ID ?? '';
export const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET ?? '';
export const TRIAL_DAYS  = 30;

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export function isAccessAllowed(status: SubscriptionStatus, trialEndsAt: Date | null): boolean {
	if (status === 'active') return true;
	if (status === 'trialing' && trialEndsAt && trialEndsAt > new Date()) return true;
	return false;
}

/** Get or create a Stripe customer ID for a restaurant. */
export async function getOrCreateCustomer(restaurantId: string, email: string, restaurantName: string): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');

	const rows = await db.select({ stripeCustomerId: subscriptions.stripeCustomerId })
		.from(subscriptions)
		.where(eq(subscriptions.restaurantId, restaurantId))
		.limit(1);

	if (rows[0]?.stripeCustomerId) return rows[0].stripeCustomerId;

	const customer = await stripe.customers.create({
		email,
		name: restaurantName,
		metadata: { restaurantId },
	});

	await db.insert(subscriptions)
		.values({
			restaurantId,
			stripeCustomerId: customer.id,
			status: 'trialing',
			trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
		})
		.onConflictDoUpdate({
			target: subscriptions.restaurantId,
			set: { stripeCustomerId: customer.id, updatedAt: new Date() },
		});

	return customer.id;
}

/** Create a Stripe Checkout session for subscription. */
export async function createCheckoutSession(
	restaurantId: string,
	customerId: string,
	successUrl: string,
	cancelUrl: string,
): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');
	if (!PRICE_ID) throw new Error('STRIPE_PRICE_ID not configured');

	const session = await stripe.checkout.sessions.create({
		customer: customerId,
		mode: 'subscription',
		line_items: [{ price: PRICE_ID, quantity: 1 }],
		subscription_data: {
			trial_period_days: TRIAL_DAYS,
			metadata: { restaurantId },
		},
		success_url: successUrl,
		cancel_url: cancelUrl,
		allow_promotion_codes: true,
	});

	return session.url!;
}

/** Create a Stripe Customer Portal session to manage subscription. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');

	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: returnUrl,
	});
	return session.url;
}

/** Handle incoming Stripe webhook event. */
export async function handleWebhookEvent(body: string, signature: string): Promise<void> {
	if (!stripe) return;
	if (!WEBHOOK_SECRET) {
		console.warn('[billing] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
		return;
	}

	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
	} catch (err) {
		console.error('[billing] webhook signature verification failed:', err);
		throw err;
	}

	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object as Stripe.Checkout.Session;
			const restaurantId = session.metadata?.restaurantId;
			const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
			if (!restaurantId || !subscriptionId) break;

			const sub = await stripe.subscriptions.retrieve(subscriptionId);
			const periodEnd = sub.items.data[0]?.current_period_end
				? new Date(sub.items.data[0].current_period_end * 1000)
				: null;
			await db.insert(subscriptions)
				.values({
					restaurantId,
					stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '',
					stripeSubscriptionId: subscriptionId,
					stripePriceId: PRICE_ID,
					status: sub.status as SubscriptionStatus,
					currentPeriodEnd: periodEnd,
					cancelAtPeriodEnd: sub.cancel_at_period_end,
				})
				.onConflictDoUpdate({
					target: subscriptions.restaurantId,
					set: {
						stripeSubscriptionId: subscriptionId,
						stripePriceId: PRICE_ID,
						status: sub.status,
						currentPeriodEnd: periodEnd,
						cancelAtPeriodEnd: sub.cancel_at_period_end,
						updatedAt: new Date(),
					},
				});
			break;
		}

		case 'customer.subscription.updated':
		case 'customer.subscription.deleted': {
			const sub = event.data.object as Stripe.Subscription;
			const restaurantId = sub.metadata?.restaurantId;
			if (!restaurantId) break;

			const periodEnd = sub.items.data[0]?.current_period_end
				? new Date(sub.items.data[0].current_period_end * 1000)
				: null;
			await db.update(subscriptions)
				.set({
					status: sub.status as SubscriptionStatus,
					currentPeriodEnd: periodEnd,
					cancelAtPeriodEnd: sub.cancel_at_period_end,
					updatedAt: new Date(),
				})
				.where(eq(subscriptions.restaurantId, restaurantId));
			break;
		}
	}
}
