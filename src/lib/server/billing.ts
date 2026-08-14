import Stripe from 'stripe';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/private';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { subscriptions, restaurants, settings } from './schema';
import { claimIdempotencyKey, releaseIdempotencyKey, STRIPE_WEBHOOK_SCOPE } from './idempotency';
import { trackEvent } from './events';
import { sendEmail, subscriptionConfirmationEmail } from './email';
import { PROVISIONAL_PRICE } from '$lib/billing-plans';

const secretKey = env.STRIPE_SECRET_KEY ?? '';
export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;

export const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET ?? '';
export const TRIAL_DAYS  = 30;

export class WebhookSignatureError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'WebhookSignatureError';
	}
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'incomplete';
export type PlanTier = 'trial' | 'starter' | 'pro' | 'business';

export interface TierConfig {
	name: string;
	monthlyInvoiceQuota: number | null;
	stripePriceId: string;
	maxLocations: number;
	features: {
		weeklyDigest:      boolean;
		stockTracking:     boolean;
		supplierScores:    boolean;
		multiLocation:     boolean;
		prioritySupport:   boolean;
		aiAssistant:       boolean;
	};
}

export const TIERS: Record<PlanTier, TierConfig> = {
	trial: {
		name: 'Prueba gratuita',
		monthlyInvoiceQuota: 20,
		stripePriceId: '',
		maxLocations: 1,
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false, aiAssistant: false },
	},
	starter: {
		name: 'Starter',
		monthlyInvoiceQuota: 100,
		stripePriceId: env.STRIPE_PRICE_ID_STARTER ?? env.STRIPE_PRICE_ID ?? '',
		maxLocations: 1,
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false, aiAssistant: false },
	},
	pro: {
		name: 'Pro',
		monthlyInvoiceQuota: 300,
		stripePriceId: env.STRIPE_PRICE_ID_PRO ?? '',
		maxLocations: 1,
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: false, prioritySupport: false, aiAssistant: true },
	},
	business: {
		name: 'Business',
		monthlyInvoiceQuota: null,
		stripePriceId: env.STRIPE_PRICE_ID_BUSINESS ?? '',
		maxLocations: 5,
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: true, prioritySupport: true, aiAssistant: true },
	},
};

export function isTierAvailable(tier: PlanTier): boolean {
	return !!TIERS[tier].stripePriceId;
}

export function planMonthlyPriceCents(tier: PlanTier): number {
	if (tier === 'trial') return 0;
	const raw = env[`PLAN_PRICE_${tier.toUpperCase()}_EUR`]?.trim();
	const override = raw ? Number(raw) : NaN;
	const eur = Number.isFinite(override) && override >= 0 ? override : PROVISIONAL_PRICE[tier];
	return Math.round(eur * 100);
}

export function tierFromPriceId(priceId: string | null | undefined): PlanTier {
	if (!priceId) return 'trial';
	for (const [tier, config] of Object.entries(TIERS) as [PlanTier, TierConfig][]) {
		if (config.stripePriceId && config.stripePriceId === priceId) return tier;
	}
	const message = `[billing] Stripe price ID ${priceId} matches no configured tier — check STRIPE_PRICE_ID_STARTER/_PRO/_BUSINESS. Falling back to 'starter'.`;
	console.error(message);
	Sentry.captureException(new Error(message), { tags: { area: 'billing', priceId } });
	return 'starter';
}

export async function billingRestaurantId(restaurantId: string): Promise<string> {
	const [row] = await db.select({ parentId: restaurants.parentId })
		.from(restaurants)
		.where(eq(restaurants.id, restaurantId))
		.limit(1);
	return row?.parentId ?? restaurantId;
}

export const UNLIMITED_QUOTA_SETTING = 'unlimited';

const LEGACY_UNLIMITED_QUOTA = 99999;

export function resolveMonthlyQuota(raw: string | null | undefined, tier: PlanTier): number | null {
	const value = raw?.trim() ?? '';
	if (value) {
		if (value.toLowerCase() === UNLIMITED_QUOTA_SETTING) return null;
		const parsed = Number(value);
		if (Number.isFinite(parsed) && parsed >= LEGACY_UNLIMITED_QUOTA) return null;
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return TIERS[tier].monthlyInvoiceQuota;
}

export async function getMonthlyQuota(restaurantId: string): Promise<number | null> {
	const tdb = forTenant(await billingRestaurantId(restaurantId));
	const [[quotaRow], [subRow]] = await Promise.all([
		db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'plan_quota')))
			.limit(1),
		db.select({ planTier: subscriptions.planTier })
			.from(subscriptions)
			.where(tdb.scope(subscriptions.restaurantId))
			.limit(1),
	]);
	return resolveMonthlyQuota(quotaRow?.value, (subRow?.planTier ?? 'trial') as PlanTier);
}

export async function applyTierSettings(restaurantId: string, tier: PlanTier): Promise<void> {
	const config = TIERS[tier];
	const quota = config.monthlyInvoiceQuota ?? UNLIMITED_QUOTA_SETTING;
	const upsert = (key: string, value: string) =>
		db.insert(settings)
			.values({ restaurantId, key, value })
			.onConflictDoUpdate({ target: [settings.restaurantId, settings.key], set: { value } });
	await Promise.all([
		upsert('plan_name', config.name),
		upsert('plan_quota', String(quota)),
	]);
}

export async function getTierFeatures(restaurantId: string): Promise<TierConfig['features']> {
	const tdb = forTenant(await billingRestaurantId(restaurantId));
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

export interface AccessState {
	allowed: boolean;
	status: SubscriptionStatus;
	trialEndsAt: Date | null;
	trialExpired: boolean;
}

export async function getAccessState(restaurantId: string): Promise<AccessState> {
	const tdb = forTenant(await billingRestaurantId(restaurantId));
	const [sub] = await db.select({
		status: subscriptions.status,
		trialEndsAt: subscriptions.trialEndsAt,
	})
		.from(subscriptions)
		.where(tdb.scope(subscriptions.restaurantId))
		.limit(1);

	if (!sub) return { allowed: true, status: 'trialing', trialEndsAt: null, trialExpired: false };

	const status = sub.status as SubscriptionStatus;
	const trialEndsAt = sub.trialEndsAt ?? null;
	const allowed = isAccessAllowed(status, trialEndsAt);
	return { allowed, status, trialEndsAt, trialExpired: !allowed && status === 'trialing' };
}

export async function getOrCreateCustomer(restaurantId: string, email: string, restaurantName: string): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');

	const tdb = forTenant(restaurantId);
	return await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'cust:' + restaurantId}))`);

		const rows = await tx.select({ stripeCustomerId: subscriptions.stripeCustomerId })
			.from(subscriptions)
			.where(tdb.scope(subscriptions.restaurantId))
			.limit(1);

		if (rows[0]?.stripeCustomerId) return rows[0].stripeCustomerId;

		const customer = await stripe.customers.create({
			email,
			name: restaurantName,
			metadata: { restaurantId },
		}, { idempotencyKey: `cust:${restaurantId}` });

		await tx.insert(subscriptions)
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
	});
}

export async function createCheckoutSession(
	restaurantId: string,
	customerId: string,
	tier: PlanTier,
	successUrl: string,
	cancelUrl: string,
	idempotencyKey?: string,
): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');
	const priceId = TIERS[tier].stripePriceId;
	if (!priceId) throw new Error(`STRIPE_PRICE_ID_${tier.toUpperCase()} not configured`);

	const session = await stripe.checkout.sessions.create({
		customer: customerId,
		mode: 'subscription',
		line_items: [{ price: priceId, quantity: 1 }],
		metadata: { restaurantId },
		subscription_data: {
			trial_period_days: TRIAL_DAYS,
			metadata: { restaurantId },
		},
		success_url: successUrl,
		cancel_url: cancelUrl,
		allow_promotion_codes: true,
	}, idempotencyKey ? { idempotencyKey } : undefined);

	return session.url!;
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
	if (!stripe) return;
	try {
		await stripe.subscriptions.cancel(subscriptionId);
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === 'resource_missing') return;
		throw err;
	}
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');

	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: returnUrl,
	});
	return session.url;
}

export async function handleWebhookEvent(body: string, signature: string): Promise<void> {
	if (!stripe) return;
	if (!WEBHOOK_SECRET) {
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
		throw new WebhookSignatureError('Webhook signature verification failed', { cause: err });
	}

	const claimed = await claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, event.id);
	if (!claimed) {
		console.info(`[billing] duplicate webhook event ${event.id} — skipping`);
		return;
	}

	const eventCreatedAt = new Date(event.created * 1000);

	try {
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
						lastEventAt: eventCreatedAt,
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
							lastEventAt: eventCreatedAt,
							updatedAt: new Date(),
						},
					});
				await applyTierSettings(restaurantId, tier);
				trackEvent('plan_upgraded', restaurantId, { tier, price_id: priceId });

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
			case 'customer.subscription.deleted':
			case 'customer.subscription.paused':
			case 'customer.subscription.resumed': {
				const sub = event.data.object as Stripe.Subscription;
				const restaurantId = sub.metadata?.restaurantId;
				if (!restaurantId) break;

				const priceId = sub.items.data[0]?.price?.id ?? null;
				const tier = tierFromPriceId(priceId);
				const periodEnd = sub.items.data[0]?.current_period_end
					? new Date(sub.items.data[0].current_period_end * 1000)
					: null;
				const applied = await db.update(subscriptions)
					.set({
						stripePriceId: priceId,
						planTier: tier,
						status: sub.status as SubscriptionStatus,
						currentPeriodEnd: periodEnd,
						cancelAtPeriodEnd: sub.cancel_at_period_end,
						lastEventAt: eventCreatedAt,
						updatedAt: new Date(),
					})
					.where(and(
						forTenant(restaurantId).scope(subscriptions.restaurantId),
						or(isNull(subscriptions.lastEventAt), lte(subscriptions.lastEventAt, eventCreatedAt)),
					))
					.returning({ id: subscriptions.id });
				if (applied.length === 0) break;

				if (sub.status === 'active') await applyTierSettings(restaurantId, tier);

				if (event.type === 'customer.subscription.deleted' || sub.status === 'canceled') {
					trackEvent('subscription_canceled', restaurantId, { tier, status: sub.status });
				} else if (sub.status === 'past_due') {
					trackEvent('payment_past_due', restaurantId, { tier, status: sub.status });
				} else if (event.type === 'customer.subscription.paused') {
					trackEvent('subscription_paused', restaurantId, { tier, status: sub.status });
				} else if (event.type === 'customer.subscription.resumed') {
					trackEvent('subscription_resumed', restaurantId, { tier, status: sub.status });
				}
				break;
			}

			case 'customer.subscription.trial_will_end': {
				const sub = event.data.object as Stripe.Subscription;
				const restaurantId = sub.metadata?.restaurantId;
				if (!restaurantId) break;

				trackEvent('trial_will_end', restaurantId, { subscription_id: sub.id });
				break;
			}
		}
	} catch (err) {
		await releaseIdempotencyKey(STRIPE_WEBHOOK_SCOPE, event.id)
			.catch((e) => console.error('[billing] failed to release webhook claim:', e));
		throw err;
	}
}
