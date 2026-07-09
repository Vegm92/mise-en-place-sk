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

import { eq } from 'drizzle-orm';
import { handleWebhookEvent, stripe, WEBHOOK_SECRET as MODULE_SECRET } from '../src/lib/server/billing';
import { subscriptions, settings } from '../src/lib/server/schema';
import { testDb, createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './helpers/test-db';

let rid = '';

/** A `customer.subscription.updated` event body for the given tenant/price/status. */
function subscriptionUpdatedBody(restaurantId: string, priceId: string, status: string): string {
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
	return JSON.stringify({ id: 'evt_test', object: 'event', type: 'customer.subscription.updated', data: { object: sub } });
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
