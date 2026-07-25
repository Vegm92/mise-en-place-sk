/**
 * Stripe billing integration.
 * Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and per-tier STRIPE_PRICE_ID_* in env.
 * Without STRIPE_SECRET_KEY the module is a no-op (safe for dev).
 */
import Stripe from 'stripe';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/private';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { subscriptions, restaurants, settings, stripeWebhookEvents } from './schema';
import { trackEvent } from './events';
import { sendEmail, subscriptionConfirmationEmail } from './email';

const secretKey = env.STRIPE_SECRET_KEY ?? '';
export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;

export const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET ?? '';
export const TRIAL_DAYS  = 30;

/**
 * Thrown by handleWebhookEvent when the Stripe signature does not verify — an
 * expected, un-retryable condition (400). Every other throw is a real handler
 * failure the route must surface as 500 so Stripe retries and Sentry sees it
 * (issue #253).
 */
export class WebhookSignatureError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'WebhookSignatureError';
	}
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
export type PlanTier = 'trial' | 'starter' | 'pro' | 'business';

// ── Tier definitions ───────────────────────────────────────────────────────────

export interface TierConfig {
	name: string;
	monthlyInvoiceQuota: number | null; // null = unlimited
	stripePriceId: string;
	/** How many restaurants one subscription covers (issue #290). */
	maxLocations: number;
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
		maxLocations: 1,
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false },
	},
	starter: {
		name: 'Starter',
		monthlyInvoiceQuota: 100, // €49/mo — covers most small Spanish restaurants (~50-80 invoices/mo)
		stripePriceId: env.STRIPE_PRICE_ID_STARTER ?? env.STRIPE_PRICE_ID ?? '',
		maxLocations: 1,
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false },
	},
	pro: {
		name: 'Pro',
		monthlyInvoiceQuota: 300, // €99/mo — active full-service restaurants
		stripePriceId: env.STRIPE_PRICE_ID_PRO ?? '',
		maxLocations: 1,
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: false, prioritySupport: false },
	},
	business: {
		name: 'Business',
		monthlyInvoiceQuota: null, // €199/mo — unlimited, up to 5 locations
		stripePriceId: env.STRIPE_PRICE_ID_BUSINESS ?? '',
		maxLocations: 5,
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: true, prioritySupport: true },
	},
};

/** True when this tier has a Stripe price ID configured and can be checked out. */
export function isTierAvailable(tier: PlanTier): boolean {
	return !!TIERS[tier].stripePriceId;
}

/**
 * Map a Stripe price ID to its tier. Falls back to 'starter' for unknown/legacy
 * price IDs — but never silently (issue #286): an unmatched price means either a
 * missing STRIPE_PRICE_ID_* var or a price rotated in the Stripe dashboard, and
 * the fallback would quota a €199/mo Business customer at 100 invoices. Log at
 * error level and report to Sentry so the mismatch is visible immediately.
 */
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

/**
 * The restaurant whose subscription pays for `restaurantId` (issue #290).
 *
 * An additional location of a multi-location account carries `parent_id` and
 * has no subscription of its own; plan, quota and features all resolve against
 * the parent, so a Business customer's second site is not treated as a fresh
 * trial. A standalone restaurant resolves to itself.
 */
export async function billingRestaurantId(restaurantId: string): Promise<string> {
	const [row] = await db.select({ parentId: restaurants.parentId })
		.from(restaurants)
		.where(eq(restaurants.id, restaurantId))
		.limit(1);
	return row?.parentId ?? restaurantId;
}

// ── Monthly invoice quota ──────────────────────────────────────────────────────
//
// One convention for "how many invoices may this tenant save this month",
// replacing the three that used to disagree (issue #295): the layout defaulted
// a missing settings row to 150, the upload gate read the same absence as
// unlimited, and unlimited tiers were stored as the magic number 99999.
//
//   settings.plan_quota = 'unlimited'  → no limit
//   settings.plan_quota = <positive n> → n invoices per calendar month
//   missing / unparseable / <= 0       → the tier's configured quota
//                                        (TIERS[tier].monthlyInvoiceQuota,
//                                        itself null for unlimited tiers)
//
// `null` means unlimited at every call site.

/** Value stored in settings.plan_quota for tiers with no invoice cap. */
export const UNLIMITED_QUOTA_SETTING = 'unlimited';

/** Pre-#295 rows wrote this magic number instead of the sentinel. */
const LEGACY_UNLIMITED_QUOTA = 99999;

/** Resolve a stored plan_quota value against the tenant's tier. null = unlimited. */
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

/** Same convention, reading both the settings row and the tier from the DB. */
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

/**
 * Sync plan settings for a restaurant when their tier changes.
 * Writes plan_name and plan_quota to the settings table so the
 * layout server can serve them without an extra subscriptions join.
 */
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

/** Look up the tier features for a restaurant. Fast enough for use in API request handlers. */
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
	/** False once a trial has lapsed (or the subscription is past due/cancelled). */
	allowed: boolean;
	status: SubscriptionStatus;
	trialEndsAt: Date | null;
	/** True specifically for "the trial ran out", which gets its own copy. */
	trialExpired: boolean;
}

/**
 * Resolve whether a tenant may still consume paid capacity — uploads,
 * extraction, AI chat (issue #287). Read access to existing data is never
 * gated on this; only new spend is.
 *
 * A tenant with no subscription row at all is treated as allowed: that only
 * happens for rows created outside onboarding, and locking those out would be
 * worse than the alternative.
 */
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

/**
 * Get or create a Stripe customer ID for a restaurant.
 *
 * Serialized against itself (issue #239): two tabs clicking "checkout"
 * concurrently must not both create a Stripe customer and orphan one. A
 * per-restaurant advisory lock held for the length of the transaction makes the
 * loser wait, re-read, and reuse the winner's customer id. The idempotency key
 * on customers.create is a second guard against a proxy-level retry minting a
 * duplicate customer.
 */
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

/** Create a Stripe Checkout session for a specific tier. */
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

	// Idempotency key (issue #239) — a proxy-level retry of this create must not
	// mint a second Checkout session (and therefore a second subscription).
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
	}, idempotencyKey ? { idempotencyKey } : undefined);

	return session.url!;
}

/**
 * Cancel a Stripe subscription immediately. Idempotent and safe to retry:
 * an already-cancelled or missing subscription is treated as success so
 * account deletion (issue #246) never wedges on a stale id. No-op when Stripe
 * isn't configured (dev).
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
	if (!stripe) return;
	try {
		await stripe.subscriptions.cancel(subscriptionId);
	} catch (err) {
		const code = (err as { code?: string }).code;
		// resource_missing → already gone; nothing to cancel.
		if (code === 'resource_missing') return;
		throw err;
	}
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
		throw new WebhookSignatureError('Webhook signature verification failed', { cause: err });
	}

	// Event-id dedup (issue #240). Stripe retries deliveries for up to 3 days;
	// claim the id and bail on a replay so we don't re-send emails or re-fire
	// telemetry. Runs before the switch so every event type is covered.
	const claimed = await db.insert(stripeWebhookEvents)
		.values({ eventId: event.id })
		.onConflictDoNothing()
		.returning({ eventId: stripeWebhookEvents.eventId });
	if (claimed.length === 0) {
		console.info(`[billing] duplicate webhook event ${event.id} — skipping`);
		return;
	}

	// Stripe event.created (seconds) — the ordering key for lifecycle events.
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
				// Out-of-order protection (issue #240): a delayed updated(past_due)
				// arriving after updated(active) must not revert a customer who just
				// paid. Only apply when this event is at least as new as the last one
				// we recorded. An empty RETURNING means the event was stale (or the
				// row is gone) — skip the tier/telemetry side effects too.
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

				// Payment-lifecycle telemetry (issue #253) — a card going past_due or
				// a customer cancelling was previously invisible.
				if (event.type === 'customer.subscription.deleted' || sub.status === 'canceled') {
					trackEvent('subscription_canceled', restaurantId, { tier, status: sub.status });
				} else if (sub.status === 'past_due') {
					trackEvent('payment_past_due', restaurantId, { tier, status: sub.status });
				}
				break;
			}
		}
	} catch (err) {
		// Processing failed — release the dedup claim so Stripe’s retry can
		// reprocess this event instead of being suppressed as a duplicate, which
		// would let payment state drift from Stripe (#240 + #253).
		await db.delete(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, event.id))
			.catch((e) => console.error('[billing] failed to release webhook claim:', e));
		throw err;
	}
}
