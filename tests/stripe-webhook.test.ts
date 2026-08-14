/**
 * Stripe webhook handler — signature verification + plan-update integration.
 *
 * `billing.test.ts` covers the pure tier-decision logic with the DB mocked
 * away. This suite exercises `handleWebhookEvent` end-to-end against a live
 * DB: it proves (a) a forged/invalid signature is rejected and mutates
 * nothing, and (b) a validly-signed `customer.subscription.updated` event
 * upgrades the tenant's plan tier and syncs the `settings` cache — the server
 * side of the #200 checklist item "Stripe checkout → webhook updates the plan".
 *
 * The `checkout.session.completed` branch is intentionally not covered here:
 * it calls `stripe.subscriptions.retrieve()`, which requires the live Stripe
 * API and a real subscription — that leg stays a staging-only check. The
 * `customer.subscription.updated` branch reads everything from the signed
 * payload, so it is fully verifiable locally with a generated test signature.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const WEBHOOK_SECRET = 'whsec_test_dummy';
const PRICE_PRO = 'price_pro_test';

// Stripe config for the module under test (constructEvent / generateTestHeaderString
// run locally; no network). A dummy secret key is enough to instantiate Stripe.
// NB: factory is hoisted above the const declarations — inline the literals.
vi.mock('$env/dynamic/private', () => ({
	env: {
		STRIPE_SECRET_KEY: 'sk_test_dummy_for_local_signature_verification',
		STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
		STRIPE_PRICE_ID_STARTER: 'price_starter_test',
		STRIPE_PRICE_ID_PRO: 'price_pro_test',
		STRIPE_PRICE_ID_BUSINESS: 'price_business_test',
	},
}));

// Don't send real emails from the confirmation path.
vi.mock('../src/lib/server/email', () => ({
	sendEmail: vi.fn().mockResolvedValue(undefined),
	subscriptionConfirmationEmail: vi.fn(() => ({ to: '', subject: '', html: '' })),
}));

// Give billing.ts a real, locality-aware DB client. Mirrors db.ts but avoids
// its hardcoded ssl:'require', which fails against CI's SSL-less ephemeral
// Postgres; the handler's writes then hit the same DB the test asserts against.
vi.mock('../src/lib/server/db', async () => {
	const { default: postgres } = await import('postgres');
	const { drizzle } = await import('drizzle-orm/postgres-js');
	const schema = await import('../src/lib/server/schema');
	const { forTenant } = await import('../src/lib/server/tenant');
	const url = process.env.DATABASE_URL ?? '';
	const isLocal = /localhost|127\.0\.0\.1/.test(url);
	const client = url
		? postgres(url, { ssl: isLocal ? false : 'require', prepare: false, max: 1, idle_timeout: 3 })
		: null;
	return { db: client ? drizzle(client, { schema }) : ({} as never), forTenant };
});

import { and, eq } from 'drizzle-orm';
import { handleWebhookEvent, stripe, WEBHOOK_SECRET as MODULE_SECRET } from '../src/lib/server/billing';
import { subscriptions, settings, idempotencyKeys } from '../src/lib/server/schema';
import { testDb, createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './helpers/test-db';
import { STRIPE_WEBHOOK_SCOPE } from '../src/lib/server/idempotency';

let rid = '';

/** A `customer.subscription.updated` event body for the given tenant/price/status. */
function subscriptionUpdatedBody(
	restaurantId: string,
	priceId: string,
	status: string,
	opts?: { id?: string; created?: number },
): string {
	const sub = {
		id: 'sub_test_123',
		object: 'subscription',
		status,
		cancel_at_period_end: false,
		metadata: { restaurantId },
		items: {
			data: [{ price: { id: priceId }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }],
		},
	};
	return JSON.stringify({
		// Unique id by default so the #240 event-id dedup table doesn't treat a
		// later test's event as an already-processed replay.
		id: opts?.id ?? `evt_${Math.random().toString(36).slice(2)}`,
		object: 'event',
		type: 'customer.subscription.updated',
		created: opts?.created ?? Math.floor(Date.now() / 1000),
		data: { object: sub },
	});
}

const planRow = async () =>
	(await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, rid)))[0];

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('stripe-wh');
	rid = r.id;
	await testDb.insert(subscriptions).values({ restaurantId: rid, planTier: 'trial', status: 'trialing' });
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('Stripe webhook — signature verification gates plan updates', () => {
	it('rejects an event with an invalid signature and mutates nothing', async () => {
		const body = subscriptionUpdatedBody(rid, PRICE_PRO, 'active');
		await expect(handleWebhookEvent(body, 't=1,v1=deadbeef')).rejects.toThrow();
		expect((await planRow())?.planTier).toBe('trial'); // unchanged
	});

	it('rejects a body tampered after signing (payload does not match signature)', async () => {
		const signed = subscriptionUpdatedBody(rid, PRICE_PRO, 'active');
		const sig = stripe!.webhooks.generateTestHeaderString({ payload: signed, secret: MODULE_SECRET });
		const tampered = subscriptionUpdatedBody(rid, 'price_business_test', 'active');
		await expect(handleWebhookEvent(tampered, sig)).rejects.toThrow();
		expect((await planRow())?.planTier).toBe('trial'); // still unchanged
	});

	it('accepts a validly-signed customer.subscription.updated and upgrades the plan', async () => {
		const body = subscriptionUpdatedBody(rid, PRICE_PRO, 'active');
		const sig = stripe!.webhooks.generateTestHeaderString({ payload: body, secret: MODULE_SECRET });
		await handleWebhookEvent(body, sig);

		const row = await planRow();
		expect(row?.planTier).toBe('pro');
		expect(row?.status).toBe('active');
		expect(row?.stripePriceId).toBe(PRICE_PRO);
		expect(row?.currentPeriodEnd).toBeInstanceOf(Date);

		// settings cache synced (read by the layout server without a subscriptions join)
		const rows = await testDb.select().from(settings).where(eq(settings.restaurantId, rid));
		const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
		expect(map.plan_name).toBe('Pro');
		expect(map.plan_quota).toBe('300');
	});
});

/**
 * The remaining two handled branches. `checkout.session.completed` is the only
 * branch that calls the live Stripe API (`subscriptions.retrieve`); we mock
 * just that network boundary so the DB provisioning + settings sync are
 * covered, while signature verification stays real. `customer.subscription.deleted`
 * reads entirely from the payload (no API), like the updated branch.
 */
describe.skipIf(!hasDbEnv)('Stripe webhook — subscription lifecycle branches', () => {
	it('checkout.session.completed provisions a fresh subscription row + settings', async () => {
		const r = await createTestRestaurant('stripe-checkout');
		const retrieveSpy = vi.spyOn(stripe!.subscriptions, 'retrieve').mockResolvedValue({
			id: 'sub_checkout_1',
			status: 'active',
			cancel_at_period_end: false,
			items: { data: [{ price: { id: PRICE_PRO }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }] },
		} as never);
		try {
			const body = JSON.stringify({
				id: `evt_checkout_${Math.random().toString(36).slice(2)}`, object: 'event',
				type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
				data: { object: {
					id: 'cs_1', object: 'checkout.session',
					metadata: { restaurantId: r.id }, subscription: 'sub_checkout_1',
					customer: 'cus_checkout_1', customer_details: { email: 'owner@example.com' },
				} },
			});
			const sig = stripe!.webhooks.generateTestHeaderString({ payload: body, secret: MODULE_SECRET });
			await handleWebhookEvent(body, sig);

			expect(retrieveSpy).toHaveBeenCalledWith('sub_checkout_1');
			const [row] = await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, r.id));
			expect(row?.planTier).toBe('pro');
			expect(row?.status).toBe('active');
			expect(row?.stripeSubscriptionId).toBe('sub_checkout_1');
			expect(row?.stripeCustomerId).toBe('cus_checkout_1');
			const settingsRows = await testDb.select().from(settings).where(eq(settings.restaurantId, r.id));
			expect(Object.fromEntries(settingsRows.map((s) => [s.key, s.value])).plan_name).toBe('Pro');
		} finally {
			retrieveSpy.mockRestore();
			await cleanupTestRestaurant(r.id);
		}
	});

	it('customer.subscription.deleted downgrades the tenant to trial', async () => {
		const r = await createTestRestaurant('stripe-deleted');
		await testDb.insert(subscriptions).values({
			restaurantId: r.id, planTier: 'pro', status: 'active', stripePriceId: PRICE_PRO,
		});
		try {
			const body = JSON.stringify({
				id: `evt_deleted_${Math.random().toString(36).slice(2)}`, object: 'event',
				type: 'customer.subscription.deleted', created: Math.floor(Date.now() / 1000),
				data: { object: {
					id: 'sub_del_1', object: 'subscription', status: 'canceled',
					cancel_at_period_end: false, metadata: { restaurantId: r.id },
					items: { data: [{ price: { id: null }, current_period_end: null }] },
				} },
			});
			const sig = stripe!.webhooks.generateTestHeaderString({ payload: body, secret: MODULE_SECRET });
			await handleWebhookEvent(body, sig);

			const [row] = await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, r.id));
			expect(row?.status).toBe('canceled');
			expect(row?.planTier).toBe('trial'); // tierFromPriceId(null) → trial
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});

/** Sign a body with the module's webhook secret. */
const sign = (body: string) =>
	stripe!.webhooks.generateTestHeaderString({ payload: body, secret: MODULE_SECRET });

/**
 * #240 — Stripe retries deliveries for up to 3 days and does not guarantee
 * ordering. The handler must (a) process each event id at most once and (b)
 * ignore an event older than the last one it applied.
 */
describe.skipIf(!hasDbEnv)('Stripe webhook — dedup + out-of-order protection', () => {
	it('processes a given event id only once (retried delivery is a no-op)', async () => {
		const r = await createTestRestaurant('stripe-dedup');
		await testDb.insert(subscriptions).values({ restaurantId: r.id, planTier: 'trial', status: 'trialing' });
		try {
			const eventId = `evt_dedup_${Math.random().toString(36).slice(2)}`;
			const body = subscriptionUpdatedBody(r.id, PRICE_PRO, 'active', { id: eventId });
			await handleWebhookEvent(body, sign(body));
			const first = (await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, r.id)))[0];
			expect(first?.planTier).toBe('pro');

			// Simulate drift, then redeliver the SAME event id: dedup must skip it,
			// leaving our manual change untouched.
			await testDb.update(subscriptions).set({ planTier: 'trial' }).where(eq(subscriptions.restaurantId, r.id));
			await handleWebhookEvent(body, sign(body));
			const second = (await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, r.id)))[0];
			expect(second?.planTier).toBe('trial'); // not re-applied
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('releases the dedup claim when processing throws, so a retry reprocesses', async () => {
		const r = await createTestRestaurant('stripe-retry');
		await testDb.insert(subscriptions).values({ restaurantId: r.id, planTier: 'trial', status: 'trialing' });
		const eventId = `evt_retry_${Math.random().toString(36).slice(2)}`;
		const body = JSON.stringify({
			id: eventId, object: 'event', type: 'checkout.session.completed',
			created: Math.floor(Date.now() / 1000),
			data: { object: {
				id: 'cs_retry', object: 'checkout.session',
				metadata: { restaurantId: r.id }, subscription: 'sub_retry_1',
				customer: 'cus_retry_1', customer_details: { email: 'owner@example.com' },
			} },
		});
		try {
			// First delivery: the Stripe API call inside the handler fails.
			const failSpy = vi.spyOn(stripe!.subscriptions, 'retrieve').mockRejectedValueOnce(new Error('stripe 503'));
			await expect(handleWebhookEvent(body, sign(body))).rejects.toThrow('stripe 503');
			failSpy.mockRestore();

			// The claim must have been released — retry is not suppressed.
			const claim = await testDb.select().from(idempotencyKeys)
				.where(and(eq(idempotencyKeys.scope, STRIPE_WEBHOOK_SCOPE), eq(idempotencyKeys.key, eventId)));
			expect(claim).toHaveLength(0);

			// Retry with the API recovered: the event now processes.
			const okSpy = vi.spyOn(stripe!.subscriptions, 'retrieve').mockResolvedValue({
				id: 'sub_retry_1', status: 'active', cancel_at_period_end: false,
				items: { data: [{ price: { id: PRICE_PRO }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }] },
			} as never);
			try {
				await handleWebhookEvent(body, sign(body));
				const [row] = await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, r.id));
				expect(row?.planTier).toBe('pro');
			} finally {
				okSpy.mockRestore();
			}
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});

	it('ignores an event older than the last one applied', async () => {
		const r = await createTestRestaurant('stripe-order');
		await testDb.insert(subscriptions).values({ restaurantId: r.id, planTier: 'trial', status: 'trialing' });
		try {
			const t2 = Math.floor(Date.now() / 1000);
			const t1 = t2 - 3600; // an hour earlier

			// Newer event: active.
			const active = subscriptionUpdatedBody(r.id, PRICE_PRO, 'active', { created: t2 });
			await handleWebhookEvent(active, sign(active));
			expect((await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, r.id)))[0]?.status)
				.toBe('active');

			// Stale event (created earlier): must NOT revert the just-paid customer.
			const stalePastDue = subscriptionUpdatedBody(r.id, PRICE_PRO, 'past_due', { created: t1 });
			await handleWebhookEvent(stalePastDue, sign(stalePastDue));
			expect((await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, r.id)))[0]?.status)
				.toBe('active'); // stale event skipped

			// A genuinely newer past_due does apply.
			const freshPastDue = subscriptionUpdatedBody(r.id, PRICE_PRO, 'past_due', { created: t2 + 3600 });
			await handleWebhookEvent(freshPastDue, sign(freshPastDue));
			expect((await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, r.id)))[0]?.status)
				.toBe('past_due');
		} finally {
			await cleanupTestRestaurant(r.id);
		}
	});
});
