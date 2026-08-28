import Stripe from 'stripe';
import { error } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const STRIPE_FOUNDER_COUPON_ID = process.env.STRIPE_FOUNDER_COUPON_ID ?? '';
const STRIPE_PRICE_ID_STARTER = (process.env.STRIPE_PRICE_ID_STARTER ?? '').trim();
const STRIPE_PRICE_ID_PRO = (process.env.STRIPE_PRICE_ID_PRO ?? '').trim();
const STRIPE_PRICE_ID_BUSINESS = (process.env.STRIPE_PRICE_ID_BUSINESS ?? '').trim();
const STRIPE_PRICE_ID = (process.env.STRIPE_PRICE_ID ?? '').trim();
import { db, forTenant, runAsSystem } from './db';
import { subscriptions, restaurants, settings, systemNotifications, userRestaurants } from './schema';
import { claimIdempotencyKey, releaseIdempotencyKey, STRIPE_WEBHOOK_SCOPE } from './idempotency';
import { trackEvent } from './events';
import { sendEmail, subscriptionConfirmationEmail, subscriptionConsolidatedEmail } from './email';
import { users } from './schema';
import { PROVISIONAL_PRICE } from '$lib/billing-plans';
import { renderTemplate } from '$lib/i18n';
import { DAY_MS } from '$lib/constants';

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
	nameKey: string;
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
		name: 'Trial',
		nameKey: 'billing.plan.trial',
		monthlyInvoiceQuota: 20,
		stripePriceId: '',
		maxLocations: 1,
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false, aiAssistant: false },
	},
	starter: {
		name: 'Starter',
		nameKey: 'billing.plan.starter',
		monthlyInvoiceQuota: 100,
		stripePriceId: STRIPE_PRICE_ID_STARTER || STRIPE_PRICE_ID,
		maxLocations: 1,
		features: { weeklyDigest: false, stockTracking: false, supplierScores: false, multiLocation: false, prioritySupport: false, aiAssistant: false },
	},
	pro: {
		name: 'Pro',
		nameKey: 'billing.plan.pro',
		monthlyInvoiceQuota: 300,
		stripePriceId: STRIPE_PRICE_ID_PRO,
		maxLocations: 1,
		features: { weeklyDigest: true, stockTracking: true, supplierScores: true, multiLocation: false, prioritySupport: false, aiAssistant: true },
	},
	business: {
		name: 'Business',
		nameKey: 'billing.plan.business',
		monthlyInvoiceQuota: null,
		stripePriceId: STRIPE_PRICE_ID_BUSINESS,
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

function stripeAccountFragment(id: string): string | null {
	return /^[a-z]+_1[A-Za-z0-9]{5}([A-Za-z0-9]{10})/.exec(id)?.[1] ?? null;
}

function configuredPriceIds(): [PlanTier, string][] {
	return (Object.entries(TIERS) as [PlanTier, TierConfig][])
		.filter(([, config]) => config.stripePriceId)
		.map(([tier, config]) => [tier, config.stripePriceId]);
}

const reportedUnknownPriceIds = new Set<string>();

export function tierFromPriceId(priceId: string | null | undefined): PlanTier {
	if (!priceId) return 'trial';
	for (const [tier, config] of Object.entries(TIERS) as [PlanTier, TierConfig][]) {
		if (config.stripePriceId && config.stripePriceId === priceId) return tier;
	}

	const configured = configuredPriceIds();
	const summary = configured.length
		? configured.map(([tier, id]) => `${tier}=${id}`).join(', ')
		: 'none — set STRIPE_PRICE_ID_STARTER/_PRO/_BUSINESS';
	const liveAccount = stripeAccountFragment(priceId);
	const configuredAccounts = new Set(
		configured.map(([, id]) => stripeAccountFragment(id)).filter((a): a is string => a !== null),
	);
	const wrongAccount = liveAccount !== null && configuredAccounts.size > 0 && !configuredAccounts.has(liveAccount);
	const hint = wrongAccount
		? ` The live price belongs to Stripe account …${liveAccount} but every configured price belongs to ${[...configuredAccounts].map(a => `…${a}`).join('/')} — STRIPE_SECRET_KEY and the price IDs are from different Stripe accounts.`
		: '';

	const message = `[billing] Stripe price ID ${priceId} matches no configured tier (configured: ${summary}).${hint} Falling back to 'starter'.`;
	console.error(message);
	if (!reportedUnknownPriceIds.has(priceId)) {
		reportedUnknownPriceIds.add(priceId);
		Sentry.captureException(new Error(message), {
			tags: { area: 'billing', priceId, billingConfig: wrongAccount ? 'stripe_account_mismatch' : 'price_id_unknown' },
		});
	}
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
	return runAsSystem(async () => {
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
	});
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
		await runAsSystem(async () => {
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
		});
	} catch (err) {
		console.error(`[billing] failed to notify owner of duplicate-subscription cancellation (restaurant=${canceledRestaurantId}):`, err);
		Sentry.captureException(err, { tags: { area: 'billing', op: 'reconcile_duplicates_notify' } });
	}
}

export const LOCATIONS_LOCKED_NOTIFICATION = 'locations_locked';

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
	return (await getEntitlements(restaurantId)).monthlyQuota;
}

export async function countGroupLocations(billingRestaurantId: string): Promise<number> {
	const [row] = await runAsSystem(() => db.select({ cnt: sql<number>`count(*)::int` })
		.from(restaurants)
		.where(eq(BILLING_PARENT, billingRestaurantId)));
	return row?.cnt ?? 0;
}

export async function notifyLocationsLocked(billingRestaurantId: string, tier: PlanTier): Promise<void> {
	const max = TIERS[tier].maxLocations;
	const locked = (await countGroupLocations(billingRestaurantId)) - max;
	if (locked <= 0) return;

	const tdb = forTenant(billingRestaurantId);
	const [pending] = await db.select({ id: systemNotifications.id })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			eq(systemNotifications.notificationType, LOCATIONS_LOCKED_NOTIFICATION),
			eq(systemNotifications.status, 'pending'),
		)))
		.limit(1);
	if (pending) return;

	const locationsLockedVars = { plan: TIERS[tier].name, max, n: locked };
	await db.insert(systemNotifications).values({
		restaurantId: billingRestaurantId,
		notificationType: LOCATIONS_LOCKED_NOTIFICATION,
		message: renderTemplate('es', 'notif.msg.locationsLocked', locationsLockedVars),
		payload: {
			messageKey: 'notif.msg.locationsLocked',
			messageVars: locationsLockedVars,
		},
	});
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

export async function requireFeature(
	feature: keyof TierConfig['features'],
	source: EntitlementSource,
): Promise<void> {
	const entitlements = await entitlementsFrom(source);
	if (!entitlements?.features[feature]) throw error(403, `This feature requires a higher plan tier`);
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
	if (!sub) return { allowed: false, status: 'trialing', trialEndsAt: null, trialExpired: true };

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

export interface SubscriptionSummary {
	status:            SubscriptionStatus;
	cancelAtPeriodEnd: boolean;
	currentPeriodEnd:  Date | null;
}

export interface Entitlements {
	billingRestaurantId: string;
	tier:         PlanTier;
	features:     TierConfig['features'];
	access:       AccessState;
	maxLocations: number;
	monthlyQuota: number | null;
	subscription: SubscriptionSummary | null;
}

export const BILLING_PARENT = sql<string>`COALESCE(${restaurants.parentId}, ${restaurants.id})`;

interface EntitlementsRow {
	billingRid:        string | null;
	planTier:          string | null;
	status:            string | null;
	trialEndsAt:       Date | null;
	cancelAtPeriodEnd: boolean | null;
	currentPeriodEnd:  Date | null;
	quotaValue:        string | null;
}

export async function getEntitlements(restaurantId: string): Promise<Entitlements> {
	const [row] = await db.select({
		billingRid:        BILLING_PARENT,
		planTier:          subscriptions.planTier,
		status:            subscriptions.status,
		trialEndsAt:       subscriptions.trialEndsAt,
		cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
		currentPeriodEnd:  subscriptions.currentPeriodEnd,
		quotaValue:        settings.value,
	})
		.from(restaurants)
		.leftJoin(subscriptions, eq(BILLING_PARENT, subscriptions.restaurantId))
		.leftJoin(settings, and(eq(BILLING_PARENT, settings.restaurantId), eq(settings.key, 'plan_quota')))
		.where(eq(restaurants.id, restaurantId))
		.limit(1);

	return entitlementsFromRow(row, restaurantId);
}

function entitlementsFromRow(row: Partial<EntitlementsRow> | undefined, restaurantId: string): Entitlements {
	const sub = row && (row.planTier != null || row.status != null)
		? {
			planTier:    row.planTier ?? null,
			status:      row.status ?? '',
			trialEndsAt: row.trialEndsAt ?? null,
		}
		: undefined;

	const access = resolveAccessState(sub);
	const tier = effectiveTier(sub);
	const config = TIERS[tier];

	return {
		billingRestaurantId: row?.billingRid ?? restaurantId,
		tier,
		features:     config.features,
		access:       access,
		maxLocations: config.maxLocations,
		monthlyQuota: resolveMonthlyQuota(row?.quotaValue, tier),
		subscription: sub
			? {
				status:            access.status,
				cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
				currentPeriodEnd:  row?.currentPeriodEnd ?? null,
			}
			: null,
	};
}

export type EntitlementSource = string | { entitlements: () => Promise<Entitlements | null> };

function entitlementsFrom(source: EntitlementSource): Promise<Entitlements | null> {
	return typeof source === 'string' ? getEntitlements(source) : source.entitlements();
}

export function memoizeEntitlements(restaurantId: string | null): () => Promise<Entitlements | null> {
	let cached: Promise<Entitlements | null> | null = null;
	return () => {
		if (!restaurantId) return Promise.resolve(null);
		cached ??= getEntitlements(restaurantId);
		return cached;
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

export const ORPHAN_SUBSCRIPTIONS_QUEUE = 'scheduled-orphan-subscriptions';
export const ORPHAN_SUBSCRIPTIONS_CRON = '50 3 * * *';

export async function reconcileOrphanSubscriptions(): Promise<{ repaired: number }> {
	const orphans = await db.select({ id: restaurants.id })
		.from(restaurants)
		.leftJoin(subscriptions, eq(restaurants.id, subscriptions.restaurantId))
		.where(and(isNull(restaurants.parentId), isNull(subscriptions.id)));

	for (const orphan of orphans) {
		await db.insert(subscriptions)
			.values({
				restaurantId: orphan.id,
				status: 'trialing',
				trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS),
			})
			.onConflictDoUpdate({
				target: subscriptions.restaurantId,
				set: { updatedAt: new Date() },
			});
		await applyTierSettings(orphan.id, 'trial');
	}

	if (orphans.length > 0) {
		const msg = `[billing] reconciled ${orphans.length} restaurant(s) with no subscription row — auto-provisioned a trial`;
		console.warn(msg);
		Sentry.captureMessage(msg, { level: 'warning', tags: { area: 'billing', op: 'reconcile_orphans' } });
	}

	return { repaired: orphans.length };
}

export async function runOrphanSubscriptionsJob(): Promise<{ repaired: number }> {
	return await reconcileOrphanSubscriptions();
}

export async function getOrCreateCustomer(restaurantId: string, email: string, restaurantName: string, forceNew = false): Promise<string> {
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

		if (!forceNew && rows[0]?.stripeCustomerId) return rows[0].stripeCustomerId;

		const trialDays = trialDaysFor(rows[0]?.founder ?? false);

		const idempotencyKey = forceNew ? `cust:${restaurantId}:retry:${Date.now()}` : `cust:${restaurantId}`;
		const customer = await stripe.customers.create({
			email,
			name: restaurantName,
			metadata: { restaurantId },
		}, { idempotencyKey });

		await tx.insert(subscriptions)
			.values({
				restaurantId,
				stripeCustomerId: customer.id,
				status: 'trialing',
				trialEndsAt: new Date(Date.now() + trialDays * DAY_MS),
			})
			.onConflictDoUpdate({
				target: subscriptions.restaurantId,
				set: { stripeCustomerId: customer.id, updatedAt: new Date() },
			});

		return customer.id;
	});
}

export interface CreateCheckoutSessionOptions {
	restaurantId: string;
	customerId: string;
	tier: PlanTier;
	successUrl: string;
	cancelUrl: string;
	idempotencyKey?: string;
	userId?: string;
}

export async function createCheckoutSession(opts: CreateCheckoutSessionOptions): Promise<string> {
	const { restaurantId, customerId, tier, successUrl, cancelUrl, idempotencyKey, userId } = opts;
	if (!stripe) throw new Error('Stripe not configured');
	const priceId = TIERS[tier].stripePriceId;
	if (!priceId) throw new Error(`STRIPE_PRICE_ID_${tier.toUpperCase()} not configured`);

	const founder    = await isFounderRestaurant(restaurantId);
	const useCoupon  = founder && FOUNDER_COUPON_ID !== '';

	let session: Stripe.Checkout.Session;
	try {
		session = await stripe.checkout.sessions.create({
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
				? { discounts: [{ promotion_code: FOUNDER_COUPON_ID }] }
				: { allow_promotion_codes: true }),
		}, idempotencyKey ? { idempotencyKey } : undefined);
	} catch (err) {
		if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
			throw new StaleCustomerError(customerId);
		}
		throw err;
	}

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
	await notifyLocationsLocked(await billingRestaurantId(restaurantId), newTier);
}

export class StaleCustomerError extends Error {
	constructor(public customerId: string) {
		super(`Stripe customer not found: ${customerId}`);
		this.name = 'StaleCustomerError';
	}
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
			console.error(`[billing] stale Stripe customer ${customerId} (test/live key mismatch or deleted)`);
			throw new StaleCustomerError(customerId);
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
	const msg = `[billing] ${eventType} ignored: subscription has no restaurantId metadata — subscription=${subscriptionId}. Add restaurantId metadata in Stripe Dashboard → Subscriptions → [sub] → Edit metadata.`;
	console.error(msg);
	Sentry.captureMessage(msg, { level: 'error', tags: { area: 'billing', event: eventType, op: 'missing_metadata' } });
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

	const applied = await db.insert(subscriptions)
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
			setWhere: or(isNull(subscriptions.lastEventAt), lte(subscriptions.lastEventAt, eventCreatedAt)),
		})
		.returning({ id: subscriptions.id });
	if (applied.length === 0) return;

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
	void sendEmail(subscriptionConfirmationEmail(
		email,
		restaurant?.name ?? 'tu restaurante',
		TIERS[tier].name,
	)).catch(e => console.error('[billing] subscription confirmation email failed:', e));
}

async function handleSubscriptionChanged(event: Stripe.Event, eventCreatedAt: Date): Promise<void> {
	const sub = event.data.object as Stripe.Subscription;
	let restaurantId = sub.metadata?.restaurantId;

	if (!restaurantId) {
		const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
		if (customerId) {
			const [row] = await db.select({ restaurantId: subscriptions.restaurantId })
				.from(subscriptions)
				.where(eq(subscriptions.stripeCustomerId, customerId))
				.limit(1);
			if (row?.restaurantId) {
				restaurantId = row.restaurantId;
				const msg = `[billing] ${event.type}: resolved restaurant ${restaurantId} from stripeCustomerId ${customerId} (subscription ${sub.id} had no metadata)`;
				console.warn(msg);
				Sentry.captureMessage(msg, { level: 'warning', tags: { area: 'billing', event: event.type, op: 'metadata_fallback' } });
			}
		}
	}

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
	await notifyLocationsLocked(restaurantId, effectiveTier({ planTier: tier, status: sub.status, trialEndsAt: null }));
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
		if (err instanceof StaleCustomerError) {
			await db.update(subscriptions)
				.set({ stripeCustomerId: null, updatedAt: new Date() })
				.where(tdb.scope(subscriptions.restaurantId));
			console.warn(`[billing] cleared stale Stripe customer ${err.customerId} for restaurant=${rootRid}`);
			return;
		}
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

	let liveList: Stripe.ApiList<Stripe.Subscription>;
	try {
		liveList = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
	} catch (err) {
		if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
			throw new StaleCustomerError(customerId);
		}
		throw err;
	}
	const matches = liveList.data.filter((s) => isLiveSubscription(s) && s.metadata?.restaurantId === rootRid);
	if (matches.length > 1) {
		const msg = `[billing] reconcile ambiguous: customer ${customerId} has ${matches.length} live subscriptions tagged for restaurant ${rootRid} — leaving unresolved`;
		console.error(msg);
		Sentry.captureMessage(msg, { tags: { area: 'billing', op: 'reconcile' } });
		return null;
	}
	const candidate = matches[0];
	if (candidate) return { live: candidate, targetSubId: candidate.id };

	const liveSubs = liveList.data.filter((s) => isLiveSubscription(s));
	if (liveSubs.length === 1) {
		const sub = liveSubs[0];
		const subId = sub.id;
		const subMeta = JSON.stringify(sub.metadata ?? {});
		const msg = `[billing] reconcile fallback: subscription ${subId} has no restaurantId metadata — customer=${customerId}, restaurant=${rootRid}, metadata=${subMeta}`;
		console.warn(msg);
		Sentry.captureMessage(msg, { level: 'warning', tags: { area: 'billing', op: 'reconcile_fallback' } });
		return { live: sub, targetSubId: subId };
	}
	if (liveSubs.length > 1) {
		const msg = `[billing] reconcile ambiguous: customer ${customerId} has ${liveSubs.length} live subscriptions without restaurantId metadata — cannot resolve for restaurant ${rootRid}`;
		console.error(msg);
		Sentry.captureMessage(msg, { tags: { area: 'billing', op: 'reconcile' } });
	}
	return null;
}
