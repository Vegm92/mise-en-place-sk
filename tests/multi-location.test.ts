/**
 * Multi-location accounts (issue #290).
 *
 * The `active_restaurant` cookie selects the tenant for every subsequent query,
 * so the switch endpoint is a tenant-isolation boundary: it must write the
 * cookie only for a restaurant the caller is actually a member of. Adding a
 * location must stay inside the plan's allowance.
 *
 * db, the rate limiter and the billing lookups are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { getTableName } from 'drizzle-orm';

const { state, rateLimitMock, applyTierSettingsMock } = vi.hoisted(() => ({
	state: {
		/** membership rows returned for the next select */
		memberships: [] as Array<Record<string, unknown>>,
		subscriptionTier: 'business' as string,
		/** restaurants the plan no longer covers (#679) */
		lockedIds: [] as string[],
		inserted: [] as Array<{ table: string; values: unknown }>,
		/** role of `USER` on `rest-1`, checked by requireOwner (#499) */
		ownerRole: 'owner' as string | undefined,
		/** size of the billing group `rest-1` belongs to (#499); defaults to
		 *  the membership count so existing per-test setup keeps working */
		groupCount: null as number | null,
	},
	rateLimitMock: vi.fn().mockResolvedValue(true),
	applyTierSettingsMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('$lib/server/db', () => {
	const resolving = (rows: () => unknown[]) => {
		const p: Record<string, unknown> = {};
		for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'limit', 'orderBy']) p[m] = () => p;
		p.then = (res: (v: unknown) => unknown) => Promise.resolve(rows()).then(res);
		return p;
	};
	const db = {
		select: (fields?: Record<string, unknown>) => resolving(() => {
			const keys = fields ?? {};
			if ('planTier' in keys) return [{ planTier: state.subscriptionTier }];
			if ('role' in keys) return state.ownerRole ? [{ role: state.ownerRole }] : [];
			if ('cnt' in keys) return [{ cnt: state.groupCount ?? state.memberships.length }];
			if ('value' in keys) return [{ value: 'true' }];
			return state.memberships;
		}),
		insert: (table: never) => ({
			values: (values: unknown) => {
				state.inserted.push({ table: getTableName(table), values });
				return {
					returning: () => Promise.resolve([{ id: 'new-rest' }]),
					then: (res: (v: unknown) => unknown) => Promise.resolve([]).then(res),
					onConflictDoNothing: () => Promise.resolve(undefined),
				};
			},
		}),
		update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
		execute: async () => [],
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
	};
	return { db, forTenant: (rid: string) => ({ rid, scope: () => ({}) }), runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});
vi.mock('$lib/server/locations', () => ({
	memberLocations: vi.fn(async () => state.memberships.map(m => ({
		restaurantId: m.restaurantId as string,
		billingRestaurantId: m.restaurantId as string,
		locked: state.lockedIds.includes(m.restaurantId as string),
	}))),
}));
vi.mock('$lib/server/billing', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/billing')>();
	return {
		...actual,
		billingRestaurantId: vi.fn(async (rid: string) => rid),
		getTierFeatures: vi.fn(async () => actual.TIERS.business.features),
		applyTierSettings: applyTierSettingsMock,
	};
});

import { getEntitlements } from '../src/lib/server/billing';
import { POST as switchPost } from '../src/routes/(app)/api/active-restaurant/+server';
import { actions as settingsActions } from '../src/routes/(app)/settings/+page.server';

const USER = { id: 'user-1', email: 'chef@example.com' };

function cookieJar() {
	const set = vi.fn();
	return { set, get: () => undefined, delete: vi.fn() };
}

function switchEvent(body: unknown, user: unknown = USER, cookies = cookieJar()) {
	return {
		request: { json: async () => body },
		locals: { user, restaurantId: 'rest-1' },
		cookies,
	} as never;
}

function addLocationEvent(name: string, cookies = cookieJar()) {
	const data = new FormData();
	data.append('name', name);
	return {
		request: { formData: async () => data },
		// hooks resolves the billing context once per request and hands it to
		// routes on locals (#519); the action reads the tier from there.
		locals: { user: USER, restaurantId: 'rest-1', entitlements: () => getEntitlements('rest-1') },
		cookies,
	} as never;
}

beforeEach(() => {
	state.memberships = [];
	state.subscriptionTier = 'business';
	state.lockedIds = [];
	state.inserted = [];
	state.ownerRole = 'owner';
	state.groupCount = null;
	rateLimitMock.mockClear().mockResolvedValue(true);
	applyTierSettingsMock.mockClear();
});

describe('POST /api/active-restaurant', () => {
	it('rejects an anonymous caller', async () => {
		await expect(switchPost(switchEvent({ restaurantId: 'rest-2' }, null)))
			.rejects.toMatchObject({ status: 401 });
	});

	it('requires a restaurant id', async () => {
		await expect(switchPost(switchEvent({}))).rejects.toMatchObject({ status: 400 });
	});

	it('refuses a restaurant the caller is not a member of', async () => {
		state.memberships = [];
		const cookies = cookieJar();
		await expect(switchPost(switchEvent({ restaurantId: 'someone-elses' }, USER, cookies)))
			.rejects.toMatchObject({ status: 403 });
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('writes an httpOnly cookie for a restaurant the caller belongs to', async () => {
		state.memberships = [{ restaurantId: 'rest-2' }];
		const cookies = cookieJar();
		const res = await switchPost(switchEvent({ restaurantId: 'rest-2' }, USER, cookies));

		expect(await res.json()).toEqual({ restaurantId: 'rest-2' });
		expect(cookies.set).toHaveBeenCalledWith('active_restaurant', 'rest-2', expect.objectContaining({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
		}));
	});

	// #679: after a Business → Pro downgrade the extra locations stay in the
	// membership table but fall outside the plan, so the switch must be refused
	// rather than handing the caller a cookie for a location they cannot use.
	it('refuses a location the current plan no longer covers', async () => {
		state.memberships = [{ restaurantId: 'rest-2' }];
		state.lockedIds = ['rest-2'];
		const cookies = cookieJar();
		await expect(switchPost(switchEvent({ restaurantId: 'rest-2' }, USER, cookies)))
			.rejects.toMatchObject({ status: 403 });
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('rate limits switching', async () => {
		rateLimitMock.mockResolvedValueOnce(false);
		await expect(switchPost(switchEvent({ restaurantId: 'rest-2' }))).rejects.toMatchObject({ status: 429 });
	});
});

describe('settings ?/addLocation', () => {
	it('creates the location as a child of the paying restaurant and switches to it', async () => {
		state.memberships = [{ restaurantId: 'rest-1' }];
		const cookies = cookieJar();
		const thrown = await Promise.resolve!(settingsActions.addLocation!(addLocationEvent('  Casa Lua Norte ', cookies)))
			.catch((e: unknown) => e);

		const restaurantInsert = state.inserted.find(i => i.table === 'restaurants');
		expect(restaurantInsert?.values).toMatchObject({ name: 'Casa Lua Norte', parentId: 'rest-1' });
		expect(state.inserted.find(i => i.table === 'user_restaurants')?.values)
			.toMatchObject({ userId: 'user-1', restaurantId: 'new-rest', role: 'owner' });
		expect(applyTierSettingsMock).toHaveBeenCalledWith('new-rest', 'business');
		expect(cookies.set).toHaveBeenCalledWith('active_restaurant', 'new-rest', expect.objectContaining({ httpOnly: true }));
		expect(isRedirect(thrown)).toBe(true);
	});

	it('generates a slug that survives duplicate names and accents', async () => {
		state.memberships = [{ restaurantId: 'rest-1' }];
		await Promise.resolve!(settingsActions.addLocation!(addLocationEvent('Café Málaga'))).catch(() => {});
		const slug = (state.inserted.find(i => i.table === 'restaurants')?.values as { slug: string }).slug;
		expect(slug).toMatch(/^cafe-malaga-[0-9a-f]{6}$/);
	});

	it('refuses on a tier without multi-location', async () => {
		state.subscriptionTier = 'pro';
		const result = await settingsActions.addLocation!(addLocationEvent('Segunda sede'));
		expect(result).toMatchObject({ status: 403, data: { error: 'set.locations.err.notAvailable' } });
		expect(state.inserted).toEqual([]);
	});

	it('refuses once the plan allowance is used up', async () => {
		state.memberships = Array.from({ length: 5 }, (_, i) => ({ restaurantId: `rest-${i}` }));
		const result = await settingsActions.addLocation!(addLocationEvent('Sexta sede'));
		expect(result).toMatchObject({ status: 403, data: { error: 'set.locations.err.limitReached' } });
		expect(state.inserted).toEqual([]);
	});

	it('rejects an empty name', async () => {
		const result = await settingsActions.addLocation!(addLocationEvent('   '));
		expect(result).toMatchObject({ status: 422, data: { error: 'set.locations.err.nameRequired' } });
	});

	// #499: only the owner of the current restaurant may add a billed location.
	it('refuses a non-owner member and inserts nothing', async () => {
		state.ownerRole = 'member';
		const result = await settingsActions.addLocation!(addLocationEvent('Sucursal ajena'));
		expect(result).toMatchObject({ status: 403, data: { error: 'set.locations.err.notOwner' } });
		expect(state.inserted).toEqual([]);
	});
});
