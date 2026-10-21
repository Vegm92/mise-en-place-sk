/**
 * RULE-267 / RULE-268 (issue #1274): the webhook stamps when a subscription
 * first went past_due, keeps that stamp on repeat past_due events, and clears
 * it on recovery. The ordering guard (RULE-268) still wins over a stale event.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';

vi.hoisted(() => {
	process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_local_signature_verification';
	process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
	process.env.STRIPE_PRICE_ID_PRO = 'price_pro_test';
});

vi.mock('../src/lib/server/email', () => ({
	sendEmail: vi.fn().mockResolvedValue(undefined),
	subscriptionConfirmationEmail: vi.fn(() => ({ to: '', subject: '', html: '' })),
	subscriptionConsolidatedEmail: vi.fn((to: string) => ({ to, subject: '', html: '' })),
}));

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_r: unknown, fn: () => unknown) => fn() };
});

import { eq } from 'drizzle-orm';
import { handleWebhookEvent, stripe, WEBHOOK_SECRET } from '../src/lib/server/billing';
import { subscriptions } from '../src/lib/server/schema';
import { testDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';

function body(restaurantId: string, status: string, created: number): string {
	return JSON.stringify({
		id: `evt_${Math.random().toString(36).slice(2)}`,
		object: 'event',
		type: 'customer.subscription.updated',
		created,
		data: { object: {
			id: 'sub_past_due_test', object: 'subscription', status, cancel_at_period_end: false,
			metadata: { restaurantId },
			items: { data: [{ price: { id: 'price_pro_test' }, current_period_end: created + 30 * 86_400 }] },
		} },
	});
}

const send = (b: string) =>
	handleWebhookEvent(b, stripe!.webhooks.generateTestHeaderString({ payload: b, secret: WEBHOOK_SECRET }));

describe.skipIf(!hasDbEnv)('webhook stamps past_due_since', () => {
	let rid = '';
	afterAll(async () => { if (rid) await cleanupTestRestaurant(rid); });

	it('stamps on first past_due, keeps it on repeat, clears on recovery', async () => {
		rid = (await createTestRestaurant('past-due-since')).id;
		await testDb.insert(subscriptions).values({ restaurantId: rid, planTier: 'pro', status: 'active' });
		const row = async () => (await testDb.select().from(subscriptions).where(eq(subscriptions.restaurantId, rid)))[0]!;
		const t = Math.floor(Date.now() / 1000);

		await send(body(rid, 'past_due', t));
		const first = (await row()).pastDueSince;
		expect(first?.getTime()).toBe(t * 1000);

		await send(body(rid, 'past_due', t + 3600));
		expect((await row()).pastDueSince?.getTime()).toBe(first!.getTime());

		await send(body(rid, 'active', t + 7200));
		expect((await row()).pastDueSince).toBeNull();
	});
});
