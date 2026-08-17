/**
 * Entitlement regression guards for issue #488.
 *
 * The stockTracking gate was enforced on GET /api/stock-levels but not on its
 * sibling POST, and the digest dismiss action was ungated while its load was
 * gated. Both are asserted per verb: a gate that covers only one handler of a
 * route is precisely the drift these tests exist to catch, so the stock case is
 * written as a table over verbs rather than a single happy-path assertion.
 *
 * The gate must also fire before body parsing, so an unentitled tenant cannot
 * probe validation behaviour — POST is therefore called with no body at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect, isHttpError } from '@sveltejs/kit';

const { features } = vi.hoisted(() => ({
	features: {
		value: {
			weeklyDigest:    false,
			stockTracking:   false,
			supplierScores:  false,
			multiLocation:   false,
			prioritySupport: false,
			aiAssistant:     false,
		},
	},
}));

const { inserted, dismissed } = vi.hoisted(() => ({
	inserted:  { count: 0 },
	dismissed: { value: [] as string[] },
}));

vi.mock('../src/lib/server/db', () => {
	const insertChain: Record<string, unknown> = {};
	insertChain['values'] = () => insertChain;
	insertChain['onConflictDoUpdate'] = () => Promise.resolve();
	return {
		db: {
			insert: () => {
				inserted.count += 1;
				return insertChain;
			},
			select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
		},
		forTenant: () => ({ scope: () => ({}) }),
	};
});

vi.mock('../src/lib/server/rate-limiter', () => ({
	checkRateLimit: () => Promise.resolve(true),
}));

vi.mock('../src/lib/server/billing', () => ({
	getTierFeatures: () => Promise.resolve(features.value),
	getAccessState: () => Promise.resolve({
		allowed: true, status: 'active', trialEndsAt: null, trialExpired: false,
	}),
}));

vi.mock('../src/lib/server/weekly-digest', () => ({
	getOrGenerateWeeklyDigest: () => Promise.resolve(null),
	dismissWeeklyDigest: (rid: string) => {
		dismissed.value.push(rid);
		return Promise.resolve();
	},
	isoWeek: () => '2026-W33',
}));

vi.mock('../src/lib/server/events', () => ({ trackEvent: () => {} }));

import { GET, POST } from '../src/routes/(app)/api/stock-levels/+server';
import { actions as digestActions } from '../src/routes/(app)/digest/+page.server';

const locals = { user: { id: 'u1' }, restaurantId: 'r1' };

const call = (fn: unknown, arg: unknown) => (fn as (a: unknown) => unknown)(arg);

const invoke = async (fn: () => unknown) => {
	try {
		return { value: await fn(), thrown: null as unknown };
	} catch (e) {
		return { value: null, thrown: e };
	}
};

const verbs: Array<[string, () => unknown]> = [
	['GET',  () => call(GET,  { locals })],
	['POST', () => call(POST, { locals, request: { json: () => Promise.resolve(null) } })],
];

beforeEach(() => {
	features.value = {
		weeklyDigest:    false,
		stockTracking:   false,
		supplierScores:  false,
		multiLocation:   false,
		prioritySupport: false,
		aiAssistant:     false,
	};
	inserted.count = 0;
	dismissed.value = [];
});

describe('/api/stock-levels entitlement parity', () => {
	it.each(verbs)('%s refuses a tenant without stockTracking', async (_verb, handler) => {
		const { thrown } = await invoke(handler);

		expect(isHttpError(thrown)).toBe(true);
		expect((thrown as { status: number }).status).toBe(403);
		expect((thrown as { body: { message: string } }).body.message).toBe('billing.upgrade.stock');
	});

	it('does not write a stock level for a tenant without stockTracking', async () => {
		await invoke(() =>
			call(POST, {
				locals,
				request: { json: () => Promise.resolve({ ingredient: 'Tomate', daily_burn_rate: '2.5' }) },
			})
		);

		expect(inserted.count).toBe(0);
	});

	it('lets an entitled tenant write a stock level', async () => {
		features.value.stockTracking = true;

		const { thrown } = await invoke(() =>
			call(POST, {
				locals,
				request: { json: () => Promise.resolve({ ingredient: 'Tomate', daily_burn_rate: '2.5' }) },
			})
		);

		expect(thrown).toBeNull();
		expect(inserted.count).toBe(1);
	});

	it('lets an entitled tenant read stock levels', async () => {
		features.value.stockTracking = true;
		const { thrown } = await invoke(verbs[0]![1]);
		expect(thrown).toBeNull();
	});
});

describe('/digest dismiss action entitlement', () => {
	it('refuses a tenant without weeklyDigest', async () => {
		const { thrown } = await invoke(() => call(digestActions['dismissDigest'], { locals }));

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toBe('/billing?upgrade=digest');
		expect(dismissed.value).toEqual([]);
	});

	it('dismisses for an entitled tenant', async () => {
		features.value.weeklyDigest = true;

		const { thrown } = await invoke(() => call(digestActions['dismissDigest'], { locals }));

		expect(isRedirect(thrown)).toBe(true);
		expect((thrown as { location: string }).location).toBe('/digest');
		expect(dismissed.value).toEqual(['r1']);
	});
});
