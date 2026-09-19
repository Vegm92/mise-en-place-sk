/**
 * Issue #1074 — /billing/confirm leaked another tenant's plan and email.
 *
 * The guard used to read `if (metaRid && metaRid !== locals.restaurantId)`, so a
 * checkout session carrying no `restaurantId` metadata — portal-created sessions,
 * and every session created before the metadata field existed — skipped the
 * comparison entirely and rendered whatever Stripe returned. Any authenticated
 * user could paste another tenant's `cs_…` id and read their billing email and
 * plan tier; the id's unguessability was the only obstacle.
 *
 * These tests pin the check as a requirement rather than a condition: the
 * session must be positively attributable to the requesting tenant, either by
 * matching metadata or by its Stripe customer id matching the row the tenant
 * owns. Anything else yields the empty `base` payload. The last test pins the
 * second half of the issue — the log line no longer carries the customer email,
 * the metadata blob, the subscription id or the price ids.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
	process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
	process.env.STRIPE_PRICE_ID_STARTER = 'price_starter';
	process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
	process.env.STRIPE_PRICE_ID_BUSINESS = 'price_business';
});

const sentryMocks = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@sentry/sveltekit', () => sentryMocks);

// `subscriptionRow` is the row the tenant-scoped lookup in stripeCustomerIdFor
// returns; set it per test to say which Stripe customer the *requesting* tenant
// owns. `scopedTo` records the restaurantId that scoping was applied with, so a
// test can assert the fallback never reads outside the caller's tenant.
const { subscriptionRow, scopedTo } = vi.hoisted(() => ({
	subscriptionRow: { value: null as unknown },
	scopedTo: { value: [] as string[] },
}));
vi.mock('$lib/server/db', () => {
	const chain = () => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'limit', 'update', 'set', 'insert', 'values', 'returning']) p[m] = () => p;
		p.then = (res: (v: unknown) => unknown) =>
			Promise.resolve(subscriptionRow.value ? [subscriptionRow.value] : []).then(res);
		return p;
	};
	return {
		db: { select: chain, update: chain, insert: chain, $count: () => Promise.resolve(0) },
		forTenant: (rid: string) => ({ scope: () => { scopedTo.value.push(rid); return {}; } }),
		runAsSystem: (fn: () => unknown) => fn(),
		runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn(),
	};
});

const { retrieve } = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock('stripe', () => ({
	default: class {
		checkout = { sessions: { retrieve } };
	},
}));

import { load } from '../src/routes/(app)/billing/confirm/+page.server';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

// A paid Pro session belonging to tenant A, with no restaurantId metadata —
// the legacy/portal shape the old guard waved through.
function tenantASessionWithoutMetadata() {
	return {
		id: 'cs_test_tenant_a',
		payment_status: 'paid',
		metadata: null,
		customer: 'cus_tenant_a',
		subscription: 'sub_tenant_a',
		customer_email: 'owner@tenant-a.example',
		customer_details: { email: 'owner@tenant-a.example' },
		line_items: { data: [{ price: { id: 'price_pro' } }] },
	};
}

function callLoad(restaurantId: string, sessionId = 'cs_test_tenant_a') {
	return (load as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		locals: { user: { id: 'user-1', email: 'b@tenant-b.example' }, restaurantId },
		url: new URL(`https://app.example/billing/confirm?session_id=${sessionId}`),
	});
}

beforeEach(() => {
	subscriptionRow.value = null;
	scopedTo.value = [];
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('/billing/confirm tenant attribution (issue #1074)', () => {
	it('returns no tenant data for a metadata-less session belonging to another tenant', async () => {
		retrieve.mockResolvedValue(tenantASessionWithoutMetadata());
		subscriptionRow.value = { stripeCustomerId: 'cus_tenant_b' };

		const data = await callLoad(TENANT_B);

		expect(data.confirmed).toBe(false);
		expect(data.email).toBeNull();
		expect(data.planNameKey).toBeNull();
		expect(JSON.stringify(data)).not.toContain('owner@tenant-a.example');
		expect(scopedTo.value).toEqual([TENANT_B]);
	});

	it('returns no tenant data when the requesting tenant has no Stripe customer at all', async () => {
		retrieve.mockResolvedValue(tenantASessionWithoutMetadata());
		subscriptionRow.value = null;

		const data = await callLoad(TENANT_B);

		expect(data.confirmed).toBe(false);
		expect(data.email).toBeNull();
	});

	it('returns no tenant data when the metadata names another tenant', async () => {
		retrieve.mockResolvedValue({ ...tenantASessionWithoutMetadata(), metadata: { restaurantId: TENANT_A } });
		subscriptionRow.value = { stripeCustomerId: 'cus_tenant_b' };

		const data = await callLoad(TENANT_B);

		expect(data.confirmed).toBe(false);
		expect(data.email).toBeNull();
	});

	it('still renders a session whose metadata names the requesting tenant', async () => {
		retrieve.mockResolvedValue({ ...tenantASessionWithoutMetadata(), metadata: { restaurantId: TENANT_A } });

		const data = await callLoad(TENANT_A);

		expect(data.confirmed).toBe(true);
		expect(data.planNameKey).toBe('billing.plan.pro');
		expect(data.email).toBe('owner@tenant-a.example');
	});

	it('still renders a metadata-less session resolved through the tenant own Stripe customer id', async () => {
		retrieve.mockResolvedValue(tenantASessionWithoutMetadata());
		subscriptionRow.value = { stripeCustomerId: 'cus_tenant_a' };

		const data = await callLoad(TENANT_A);

		expect(data.confirmed).toBe(true);
		expect(data.planNameKey).toBe('billing.plan.pro');
		expect(data.email).toBe('owner@tenant-a.example');
	});

	it('logs only the session id and payment status', async () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});
		retrieve.mockResolvedValue({ ...tenantASessionWithoutMetadata(), metadata: { restaurantId: TENANT_A } });

		await callLoad(TENANT_A);

		expect(info).toHaveBeenCalledTimes(1);
		const logged = JSON.stringify(info.mock.calls[0]);
		expect(logged).toContain('cs_test_tenant_a');
		expect(logged).toContain('paid');
		expect(logged).not.toContain('owner@tenant-a.example');
		expect(logged).not.toContain('price_pro');
		expect(logged).not.toContain('sub_tenant_a');
		expect(logged).not.toContain(TENANT_A);
	});
});
