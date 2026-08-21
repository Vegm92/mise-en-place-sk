import Stripe from 'stripe';
import { error } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const STRIPE_FOUNDER_COUPON_ID = process.env.STRIPE_FOUNDER_COUPON_ID ?? '';
const STRIPE_PRICE_ID_STARTER = process.env.STRIPE_PRICE_ID_STARTER ?? '';
const STRIPE_PRICE_ID_PRO = process.env.STRIPE_PRICE_ID_PRO ?? '';
const STRIPE_PRICE_ID_BUSINESS = process.env.STRIPE_PRICE_ID_BUSINESS ?? '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? '';
import { db, forTenant } from './db';
import { subscriptions, restaurants, settings, userRestaurants } from './schema';
import { claimIdempotencyKey, releaseIdempotencyKey, STRIPE_WEBHOOK_SCOPE } from './idempotency';
import { trackEvent } from './events';
import { sendEmail, subscriptionConfirmationEmail, subscriptionConsolidatedEmail } from './email';
import { users } from './schema/auth';
import { PROVISIONAL_PRICE } from '$lib/billing-plans';

const secretKey = STRIPE_SECRET_KEY;
export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;

export const WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET;
export const TRIAL_DAYS         = 14;
export const FOUNDER_TRIAL_DAYS = 30;
export const FOUNDER_COUPON_ID  = STRIPE_FOUNDER_COUPON_ID;

export function trialDaysFor(founder: boolean): number {
	return founder ? FOUNDER_TRIAL_DAYS : TRIAL_DAYS;
}

export async function isFounderRestaurant(restaurantId: string): Promise<boolean> {
	const tdb = forTenant(restaurantId);
	const [row] = await db
		.select({ founder: subscriptions.founder })
		.from(subscriptions)
		.where(tdb.scope(subscriptions.restaurantId))
		.limit(1);
	return row?.founder ?? false;
}

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
		stripePriceId: STRIPE_PRICE_ID_STARTER ?? STRIPE_PRICE_ID ?? '',
		maxLocations: 1,
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false, aiAssistant: false },
	},
	pro: {
		name: 'Pro',
		monthlyInvoiceQuota: 300,
		stripePriceId: STRIPE_PRICE_ID_PRO ?? '',
		maxLocations: 1,
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: false, prioritySupport: false, aiAssistant: true },
	},
	business: {
		name: 'Business',
		monthlyInvoiceQuota: null,
		stripePriceId: STRIPE_PRICE_ID_BUSINESS ?? '',
		maxLocations: 5,
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: true, prioritySupport: true, aiAssistant: true },
	},
};

export function isTierAvailable(tier: PlanTier): boolean {
	return !!TIERS[tier].stripePriceId;
}

export function planMonthlyPriceCents(tier: PlanTier): number {
	if (tier === 'trial') return 0;
	const raw = process.env[`PLAN_PRICE_${tier.toUpperCase()}_EUR`]?.trim();
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

const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'paused'];

export interface OwnedSubscription {
	restaurantId: string;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
}

export async function ownedActiveSubscriptions(userId: string): Promise<OwnedSubscription[]> {
	const owned = await db.select({ restaurantId: userRestaurants.restaurantId })
		.from(userRestaurants)
		.where(and(
			eq(userRestaurants.userId, userId),
			eq(userRestaurants.role, 'owner'),
		));
	if (owned.length === 0) return [];

	const ownedIds = owned.map(r => r.restaurantId);
	const restRows = await db.select({ id: restaurants.id, parentId: restaurants.parentId })
		.from(restaurants)
		.where(inArray(restaurants.id, ownedIds));
	const roots = [...new Set(restRows.map(r => r.parentId ?? r.id))];

	return db.select({
		restaurantId: subscriptions.restaurantId,
		stripeCustomerId: subscriptions.stripeCustomerId,
		stripeSubscriptionId: subscriptions.stripeSubscriptionId,
	})
		.from(subscriptions)
		.where(and(
			inArray(subscriptions.restaurantId, roots),
			inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
			isNotNull(subscriptions.stripeSubscriptionId),
		));
}

export async function cancelDuplicateSubscriptionsForUser(userId: string, keepRestaurantId: string): Promise<void> {
	const active = await ownedActiveSubscriptions(userId);
	const duplicates = active.filter(s => s.restaurantId !== keepRestaurantId && s.stripeSubscriptionId);
	if (duplicates.length === 0) return;

	for (const dup of duplicates) {
		try {
			if (stripe) await stripe.subscriptions.cancel(dup.stripeSubscriptionId!);
			console.info(`[billing] one-subscription-per-user: canceled duplicate ${dup.stripeSubscriptionId} (restaurant=${dup.restaurantId}) for user=${userId}`);
		} catch (err) {
			const code = (err as { code?: string }).code;
			if (code === 'resource_missing') continue;
			console.error(`[billing] one-subscription-per-user: failed to cancel duplicate ${dup.stripeSubscriptionId}:`, err);
			Sentry.captureException(err, { tags: { area: 'billing', op: 'reconcile_duplicates' } });
			continue;
		}
		await notifyDuplicateSubscriptionCanceled(dup.restaurantId, keepRestaurantId);
	}
}

async function notifyDuplicateSubscriptionCanceled(canceledRestaurantId: string, keptRestaurantId: string): Promise<void> {
	try {
		const [owner] = await db.select({ userId: userRestaurants.userId })
			.from(userRestaurants)
			.where(forTenant(canceledRestaurantId).scope(userRestaurants.restaurantId, eq(userRestaurants.role, 'owner')))
			.limit(1);
		if (!owner) return;

		const [ownerRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, owner.userId)).limit(1);
		if (!ownerRow?.email) return;

		const [[canceled], [kept]] = await Promise.all([
			db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, canceledRestaurantId)),
			db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, keptRestaurantId)),
		]);

		await sendEmail(subscriptionConsolidatedEmail(
			ownerRow.email,
			canceled?.name ?? 'tu restaurante',
			kept?.name ?? 'otro restaurante',
		));
	} catch (err) {
		console.error(`[billing] failed to notify owner of duplicate-subscription cancellation (restaurant=${canceledRestaurantId}):`, err);
		Sentry.captureException(err, { tags: { area: 'billing', op: 'reconcile_duplicates_notify' } });
	}
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

export async function requireFeature(feature: keyof TierConfig['features'], restaurantId: string): Promise<void> {
	const features = await getTierFeatures(restaurantId);
	if (!features[feature]) throw error(403, `This feature requires a higher plan tier`);
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

export function resolveAccessState(
	sub: { status: string; trialEndsAt: Date | null } | undefined,
): AccessState {
	if (!sub) return { allowed: true, status: 'trialing', trialEndsAt: null, trialExpired: false };

	const status = sub.status as SubscriptionStatus;
	const trialEndsAt = sub.trialEndsAt ?? null;
	const allowed = isAccessAllowed(status, trialEndsAt);
	return { allowed, status, trialEndsAt, trialExpired: !allowed && status === 'trialing' };
}

export function effectiveTier(
	sub: { planTier: string | null; status: string; trialEndsAt: Date | null } | undefined,
): PlanTier {
	if (!sub) return 'trial';

	const downgraded =
		sub.status === 'canceled' ||
		sub.status === 'paused' ||
		sub.status === 'incomplete' ||
		(!resolveAccessState(sub).allowed && sub.status === 'trialing');

	return downgraded ? 'trial' : ((sub.planTier ?? 'trial') as PlanTier);
}

export interface Entitlements {
	billingRestaurantId: string;
	tier:         PlanTier;
	features:     TierConfig['features'];
	access:       AccessState;
	maxLocations: number;
}

export async function getEntitlements(restaurantId: string): Promise<Entitlements> {
	const billingRid = await billingRestaurantId(restaurantId);
	const tdb = forTenant(billingRid);
	const [sub] = await db.select({
		planTier:    subscriptions.planTier,
		status:      subscriptions.status,
		trialEndsAt: subscriptions.trialEndsAt,
	})
		.from(subscriptions)
		.where(tdb.scope(subscriptions.restaurantId))
		.limit(1);

	const access = resolveAccessState(sub);
	const tier = effectiveTier(sub);
	const config = TIERS[tier];

	return {
		billingRestaurantId: billingRid,
		tier,
		features:     config.features,
		access:       access,
		maxLocations: config.maxLocations,
	};
}

export async function getPlanTier(restaurantId: string): Promise<PlanTier> {
	return (await getEntitlements(restaurantId)).tier;
}

export async function getTierFeatures(restaurantId: string): Promise<TierConfig['features']> {
	return (await getEntitlements(restaurantId)).features;
}

export async function getAccessState(restaurantId: string): Promise<AccessState> {
	return (await getEntitlements(restaurantId)).access;
}

export async function getOrCreateCustomer(restaurantId: string, email: string, restaurantName: string): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');

	const tdb = forTenant(restaurantId);
	return await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'cust:' + restaurantId}))`);

		const rows = await tx.select({
			stripeCustomerId: subscriptions.stripeCustomerId,
			founder: subscriptions.founder,
		})
			.from(subscriptions)
			.where(tdb.scope(subscriptions.restaurantId))
			.limit(1);

		if (rows[0]?.stripeCustomerId) return rows[0].stripeCustomerId;

		const trialDays = trialDaysFor(rows[0]?.founder ?? false);

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
				trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
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
	userId?: string,
): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');
	const priceId = TIERS[tier].stripePriceId;
	if (!priceId) throw new Error(`STRIPE_PRICE_ID_${tier.toUpperCase()} not configured`);

	const founder    = await isFounderRestaurant(restaurantId);
	const useCoupon  = founder && FOUNDER_COUPON_ID !== '';

	const session = await stripe.checkout.sessions.create({
		customer: customerId,
		mode: 'subscription',
		line_items: [{ price: priceId, quantity: 1 }],
		metadata: { restaurantId, ...(userId ? { userId } : {}) },
		subscription_data: {
			trial_period_days: trialDaysFor(founder),
			metadata: { restaurantId, ...(userId ? { userId } : {}) },
		},
		success_url: successUrl,
		cancel_url: cancelUrl,
		...(useCoupon
			? { discounts: [{ coupon: FOUNDER_COUPON_ID }] }
			: { allow_promotion_codes: true }),
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

export async function switchTier(restaurantId: string, newTier: PlanTier): Promise<void> {
	if (!stripe) return;
	const priceId = TIERS[newTier].stripePriceId;
	if (!priceId) throw new Error(`STRIPE_PRICE_ID_${newTier.toUpperCase()} not configured`);

	const tdb = forTenant(restaurantId);
	const [sub] = await db.select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
		.from(subscriptions)
		.where(tdb.scope(subscriptions.restaurantId))
		.limit(1);
	if (!sub?.stripeSubscriptionId) throw new Error('No subscription to switch');

	const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
	const itemId = stripeSub.items.data[0]?.id;
	if (!itemId) throw new Error('Subscription has no items to switch');

	await stripe.subscriptions.update(sub.stripeSubscriptionId, {
		items: [{ id: itemId, price: priceId }],
		cancel_at_period_end: false,
	});

	await db.update(subscriptions)
		.set({ planTier: newTier, stripePriceId: priceId, cancelAtPeriodEnd: false, updatedAt: new Date() })
		.where(tdb.scope(subscriptions.restaurantId));
	await applyTierSettings(restaurantId, newTier);
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
	if (!stripe) throw new Error('Stripe not configured');

	try {
		const session = await stripe.billingPortal.sessions.create({
			customer: customerId,
			return_url: returnUrl,
		});
		return session.url;
	} catch (err) {
		if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
			console.error(`[billing] stale Stripe customer ${customerId} — falling back to billing page`);
			return returnUrl;
		}
		throw err;
	}
}

export async function handleWebhookEvent(body: string, signature: string): Promise<void> {
	if (!webhookConfigured()) return;

	let event: Stripe.Event;
	try {
		event = stripe!.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
	} catch (err) {
		console.error('[billing] webhook signature verification failed:', err);
		throw new WebhookSignatureError('Webhook signature verification failed', { cause: err });
	}

	const claimed = await claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, event.id);
	if (!claimed) {
		console.info(`[billing] duplicate webhook event ${event.id} — skipping`);
		return;
	}

	try {
		await dispatchEvent(event, new Date(event.created * 1000));
	} catch (err) {
		await releaseIdempotencyKey(STRIPE_WEBHOOK_SCOPE, event.id)
			.catch((e) => console.error('[billing] failed to release webhook claim:', e));
		throw err;
	}
}

function webhookConfigured(): boolean {
	if (!stripe) {
		if (NODE_ENV === 'production') {
			throw new Error('STRIPE_SECRET_KEY is required in production — refusing to silently accept webhook');
		}
		console.warn('[billing] STRIPE_SECRET_KEY not set — skipping webhook processing (dev only)');
		return false;
	}
	if (!WEBHOOK_SECRET) {
		if (NODE_ENV === 'production') {
			throw new Error('STRIPE_WEBHOOK_SECRET is required in production — refusing to process unverified webhook');
		}
		console.warn('[billing] STRIPE_WEBHOOK_SECRET not set — skipping signature verification (dev only)');
		return false;
	}
	return true;
}

async function dispatchEvent(event: Stripe.Event, eventCreatedAt: Date): Promise<void> {
	switch (event.type) {
		case 'checkout.session.completed':
			await handleCheckoutCompleted(event, eventCreatedAt);
			break;
		case 'customer.subscription.updated':
		case 'customer.subscription.deleted':
		case 'customer.subscription.paused':
		case 'customer.subscription.resumed':
			await handleSubscriptionChanged(event, eventCreatedAt);
			break;
		case 'customer.subscription.trial_will_end':
			await handleTrialWillEnd(event);
			break;
	}
}

function subscriptionFields(sub: Stripe.Subscription): { priceId: string | null; tier: PlanTier; periodEnd: Date | null } {
	const priceId = sub.items.data[0]?.price?.id ?? null;
	const tier = tierFromPriceId(priceId);
	const periodEnd = sub.items.data[0]?.current_period_end
		? new Date(sub.items.data[0].current_period_end * 1000)
		: null;
	return { priceId, tier, periodEnd };
}

function logIgnored(eventType: string, detail: string): void {
	const msg = `[billing] ${eventType} ignored: ${detail}`;
	console.error(msg);
	Sentry.captureMessage(msg, { tags: { area: 'billing', event: eventType } });
}

function missingSubscriptionMetadata(eventType: string, subscriptionId: string | undefined, restaurantId: string | undefined): boolean {
	if (restaurantId) return false;
	logIgnored(eventType, `subscription has no restaurantId metadata — subscription=${subscriptionId}`);
	return true;
}

async function handleCheckoutCompleted(event: Stripe.Event, eventCreatedAt: Date): Promise<void> {
	const session = event.data.object as Stripe.Checkout.Session;
	const restaurantId = session.metadata?.restaurantId;
	const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
	if (!restaurantId || !subscriptionId) {
		logIgnored(event.type, `missing metadata — restaurantId=${restaurantId ?? 'null'}, subscriptionId=${subscriptionId ?? 'null'}, session=${session.id}`);
		return;
	}

	const sub = await stripe!.subscriptions.retrieve(subscriptionId);
	const { priceId, tier, periodEnd } = subscriptionFields(sub);
	const userId = typeof session.metadata?.userId === 'string' ? session.metadata.userId : null;
	const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '';

	await db.insert(subscriptions)
		.values({
			restaurantId,
			stripeCustomerId,
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
	console.info(`[billing] checkout.session.completed applied — restaurant=${restaurantId}, tier=${tier}, status=${sub.status}, subscription=${subscriptionId}`);

	if (userId) {
		await cancelDuplicateSubscriptionsForUser(userId, restaurantId);
	}

	const customerEmail = session.customer_details?.email ?? session.customer_email;
	if (customerEmail) {
		await sendSubscriptionConfirmation(restaurantId, customerEmail, tier);
	}
}

async function sendSubscriptionConfirmation(restaurantId: string, email: string, tier: PlanTier): Promise<void> {
	const [restaurant] = await db.select({ name: restaurants.name })
		.from(restaurants)
		.where(eq(restaurants.id, restaurantId));
	sendEmail(subscriptionConfirmationEmail(
		email,
		restaurant?.name ?? 'tu restaurante',
		TIERS[tier].name,
	)).catch(e => console.error('[billing] subscription confirmation email failed:', e));
}

async function handleSubscriptionChanged(event: Stripe.Event, eventCreatedAt: Date): Promise<void> {
	const sub = event.data.object as Stripe.Subscription;
	const restaurantId = sub.metadata?.restaurantId;
	if (missingSubscriptionMetadata(event.type, sub.id, restaurantId)) return;

	const { priceId, tier, periodEnd } = subscriptionFields(sub);
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
	if (applied.length === 0) return;

	await applyStatusSettings(restaurantId, sub.status, tier);
	trackSubscriptionEvent(event, restaurantId, tier, sub.status);
	console.info(`[billing] ${event.type} applied — restaurant=${restaurantId}, tier=${tier}, status=${sub.status}, subscription=${sub.id}`);
}

async function applyStatusSettings(restaurantId: string, status: string, tier: PlanTier): Promise<void> {
	if (status === 'active') {
		await applyTierSettings(restaurantId, tier);
	} else if (status === 'canceled' || status === 'paused' || status === 'incomplete') {
		await applyTierSettings(restaurantId, 'trial');
	}
}

function trackSubscriptionEvent(event: Stripe.Event, restaurantId: string, tier: PlanTier, status: string): void {
	if (event.type === 'customer.subscription.deleted' || status === 'canceled') {
		trackEvent('subscription_canceled', restaurantId, { tier, status });
	} else if (status === 'past_due') {
		trackEvent('payment_past_due', restaurantId, { tier, status });
	} else if (event.type === 'customer.subscription.paused') {
		trackEvent('subscription_paused', restaurantId, { tier, status });
	} else if (event.type === 'customer.subscription.resumed') {
		trackEvent('subscription_resumed', restaurantId, { tier, status });
	}
}

async function handleTrialWillEnd(event: Stripe.Event): Promise<void> {
	const sub = event.data.object as Stripe.Subscription;
	const restaurantId = sub.metadata?.restaurantId;
	if (missingSubscriptionMetadata(event.type, sub.id, restaurantId)) return;

	trackEvent('trial_will_end', restaurantId, { subscription_id: sub.id });
}

export async function syncSubscriptionFromStripe(restaurantId: string): Promise<void> {
	if (!stripe) return;
	const rootRid = await billingRestaurantId(restaurantId);
	const tdb = forTenant(rootRid);
	const [sub] = await db.select({
		stripeSubscriptionId: subscriptions.stripeSubscriptionId,
		stripeCustomerId: subscriptions.stripeCustomerId,
	})
		.from(subscriptions)
		.where(tdb.scope(subscriptions.restaurantId))
		.limit(1);
	const customerId = sub?.stripeCustomerId ?? null;
	const targetSubId = sub?.stripeSubscriptionId ?? null;

	try {
		const resolved = await resolveLiveSubscription(stripe, targetSubId, customerId, rootRid);
		if (!resolved) return;

		const { live, targetSubId: resolvedSubId } = resolved;
		const { priceId, tier, periodEnd } = subscriptionFields(live);
		const trialEndsAt = live.trial_end ? new Date(live.trial_end * 1000) : null;
		const status = live.status as SubscriptionStatus;

		await db.update(subscriptions)
			.set({
				stripeSubscriptionId: resolvedSubId,
				stripeCustomerId: customerId,
				stripePriceId: priceId,
				planTier: tier,
				status,
				trialEndsAt,
				currentPeriodEnd: periodEnd,
				cancelAtPeriodEnd: live.cancel_at_period_end,
				lastEventAt: new Date(),
				updatedAt: new Date(),
			})
			.where(tdb.scope(subscriptions.restaurantId));

		await applyStatusSettings(rootRid, status, tier);
		console.info(`[billing] reconciled subscription from Stripe — restaurant=${rootRid}, tier=${tier}, status=${status}, subscription=${resolvedSubId}`);
	} catch (err) {
		console.error(`[billing] reconcile failed for ${rootRid}:`, err);
		Sentry.captureException(err, { tags: { area: 'billing', op: 'reconcile' } });
	}
}

function isLiveSubscription(sub: Stripe.Subscription): boolean {
	return sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
}

async function resolveLiveSubscription(
	stripe: Stripe,
	targetSubId: string | null,
	customerId: string | null,
	rootRid: string,
): Promise<{ live: Stripe.Subscription; targetSubId: string } | null> {
	if (targetSubId) {
		const stored = await stripe.subscriptions.retrieve(targetSubId);
		if (isLiveSubscription(stored)) return { live: stored, targetSubId };
	}
	if (!customerId) return null;

	const liveList = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
	const matches = liveList.data.filter((s) => isLiveSubscription(s) && s.metadata?.restaurantId === rootRid);
	if (matches.length > 1) {
		const msg = `[billing] reconcile ambiguous: customer ${customerId} has ${matches.length} live subscriptions tagged for restaurant ${rootRid} — leaving unresolved`;
		console.error(msg);
		Sentry.captureMessage(msg, { tags: { area: 'billing', op: 'reconcile' } });
		return null;
	}
	const candidate = matches[0];
	if (!candidate) return null;
	return { live: candidate, targetSubId: candidate.id };
}
