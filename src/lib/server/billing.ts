/**
 * Stripe billing integration.
 * Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and per-tier STRIPE_PRICE_ID_* in env.
 * Without STRIPE_SECRET_KEY the module is a no-op (safe for dev).
 */
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { db, forTenant } from './db';
import { subscriptions, restaurants, settings } from './schema';
import { trackEvent } from './events';
import { sendEmail, subscriptionConfirmationEmail } from './email';

const secretKey = env.STRIPE_SECRET_KEY ?? '';
export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;

export const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET ?? '';
export const TRIAL_DAYS  = 30;

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
export type PlanTier = 'trial' | 'starter' | 'pro' | 'business';

// ── Tier definitions ───────────────────────────────────────────────────────────

export interface TierConfig {
	name: string;
	monthlyInvoiceQuota: number | null; // null = unlimited
	stripePriceId: string;
	features: {
		weeklyDigest:      boolean;
		stockTracking:     boolean;
		supplierScores:    boolean;
		multiLocation:     boolean;
		prioritySupport:   boolean;
	};
}

// Prices are managed in Stripe; these quotas + features define what each tier includes.
// Prices: Starter €49/mo · Pro €99/mo · Business €199/mo (or custom for chains).
export const TIERS: Record<PlanTier, TierConfig> = {
	trial: {
		name: 'Prueba gratuita',
		monthlyInvoiceQuota: 20, // enough to evaluate; not enough to rely on for free
		stripePriceId: '',
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false },
	},
	starter: {
		name: 'Starter',
		monthlyInvoiceQuota: 100, // €49/mo — covers most small Spanish restaurants (~50-80 invoices/mo)
		stripePriceId: env.STRIPE_PRICE_ID_STARTER ?? env.STRIPE_PRICE_ID ?? '',
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false },
	},
	pro: {
		name: 'Pro',
		monthlyInvoiceQuota: 300, // €99/mo — active full-service restaurants
		stripePriceId: env.STRIPE_PRICE_ID_PRO ?? '',
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: false, prioritySupport: false },
	},
	business: {
		name: 'Business',
		monthlyInvoiceQuota: null, // €199/mo — unlimited, up to 5 locations
		stripePriceId: env.STRIPE_PRICE_ID_BUSINESS ?? '',
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: true, prioritySupport: true },
	},
};

/** Map a Stripe price ID to its tier. Falls back to 'starter' for unknown/legacy price IDs. */
export function tierFromPriceId(priceId: string | null | undefined): PlanTier {
	if (!priceId) return 'trial';
	for (const [tier, config] of Object.entries(TIERS) as [PlanTier, TierConfig][]) {
		if (config.stripePriceId && config.stripePriceId === priceId) return tier;
	}
	return 'starter';
}

/**
 * Sync plan settings for a restaurant when their tier changes.
 * Writes plan_name and plan_quota to the settings table so the
 * layout server can serve them without an extra subscriptions join.
 */
export async function applyTierSettings(restaurantId: string, tier: PlanTier): Promise<void> {
	const config = TIERS[tier];
	const quota = config.monthlyInvoiceQuota ?? 99999;
	const upsert = (key: string, value: string) =>
		db.insert(settings)
			.values({ restaurantId, key, value })
			.onConflictDoUpdate({ target: [settings.restaurantId, settings.key], set: { value } });
	await Promise.all([
		upsert('plan_name', config.name),
		upsert('plan_quota', String(quota)),
	]);
}

/** Look up the tier features for a restaurant. Fast enough for use in API request handlers. */
export async function getTierFeatures(restaurantId: string): Promise<TierConfig['features']> {
	const tdb = forTenant(restaurantId);
	const [row] = await db.select({ planTier: subscriptions.planTier })
		.from(subscriptions)
		.where(tdb.scope(subscriptions.restaurantId))
		.limit(1);
	const tier = (row?.planTier ?? 'trial') as PlanTier;
	return TIERS[tier].features;
}

export function isAccessAllowed(status: SubscriptionStatus, trialEndsAt: Date | null): boolean {
	if (status === 'active') return true;
	if (status === 'trialing' && trialEndsAt && trialEndsAt > new Date()) return true;
	return false;
}

/** Get or create a Stripe customer ID for a restaurant. */
export async function getOrCreateCustomer(restaurantId: string, email: string, restaurantName: string): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');

	const tdb = forTenant(restaurantId);
	const rows = await db.select({ stripeCustomerId: subscriptions.stripeCustomerId })
		.from(subscriptions)
		.where(tdb.scope(subscriptions.restaurantId))
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

/** Create a Stripe Checkout session for a specific tier. */
export async function createCheckoutSession(
	restaurantId: string,
	customerId: string,
	tier: PlanTier,
	successUrl: string,
	cancelUrl: string,
): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');
	const priceId = TIERS[tier].stripePriceId;
	if (!priceId) throw new Error(`STRIPE_PRICE_ID_${tier.toUpperCase()} not configured`);

	const session = await stripe.checkout.sessions.create({
		customer: customerId,
		mode: 'subscription',
		line_items: [{ price: priceId, quantity: 1 }],
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
		// In production an unverified webhook is a security hole: forged events
		// could mutate subscription state. Fail loudly instead of silently
		// accepting/ignoring. In dev we allow skipping for local testing.
		if (process.env.NODE_ENV === 'production') {
			throw new Error('STRIPE_WEBHOOK_SECRET is required in production — refusing to process unverified webhook');
		}
		console.warn('[billing] STRIPE_WEBHOOK_SECRET not set — skipping signature verification (dev only)');
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
			const priceId = sub.items.data[0]?.price?.id ?? null;
			const tier = tierFromPriceId(priceId);
			const periodEnd = sub.items.data[0]?.current_period_end
				? new Date(sub.items.data[0].current_period_end * 1000)
				: null;
			await db.insert(subscriptions)
				.values({
					restaurantId,
					stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '',
					stripeSubscriptionId: subscriptionId,
					stripePriceId: priceId,
					planTier: tier,
					status: sub.status as SubscriptionStatus,
					currentPeriodEnd: periodEnd,
					cancelAtPeriodEnd: sub.cancel_at_period_end,
				})
				.onConflictDoUpdate({
					target: subscriptions.restaurantId,
					set: {
						stripeSubscriptionId: subscriptionId,
						stripePriceId: priceId,
						planTier: tier,
						status: sub.status,
						currentPeriodEnd: periodEnd,
						cancelAtPeriodEnd: sub.cancel_at_period_end,
						updatedAt: new Date(),
					},
				});
			await applyTierSettings(restaurantId, tier);
			trackEvent('plan_upgraded', restaurantId, { tier, price_id: priceId });

			// Subscription-confirmation email (fire-and-forget, issue #202).
			const customerEmail = session.customer_details?.email ?? session.customer_email;
			if (customerEmail) {
				const [restaurant] = await db.select({ name: restaurants.name })
					.from(restaurants)
					.where(eq(restaurants.id, restaurantId));
				sendEmail(subscriptionConfirmationEmail(
					customerEmail,
					restaurant?.name ?? 'tu restaurante',
					TIERS[tier].name,
				)).catch(e => console.error('[billing] subscription confirmation email failed:', e));
			}
			break;
		}

		case 'customer.subscription.updated':
		case 'customer.subscription.deleted': {
			const sub = event.data.object as Stripe.Subscription;
			const restaurantId = sub.metadata?.restaurantId;
			if (!restaurantId) break;

			const priceId = sub.items.data[0]?.price?.id ?? null;
			const tier = tierFromPriceId(priceId);
			const periodEnd = sub.items.data[0]?.current_period_end
				? new Date(sub.items.data[0].current_period_end * 1000)
				: null;
			await db.update(subscriptions)
				.set({
					stripePriceId: priceId,
					planTier: tier,
					status: sub.status as SubscriptionStatus,
					currentPeriodEnd: periodEnd,
					cancelAtPeriodEnd: sub.cancel_at_period_end,
					updatedAt: new Date(),
				})
				.where(forTenant(restaurantId).scope(subscriptions.restaurantId));
			if (sub.status === 'active') await applyTierSettings(restaurantId, tier);
			break;
		}
	}
}
