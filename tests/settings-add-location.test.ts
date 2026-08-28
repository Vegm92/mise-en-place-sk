/**
 * Settings → Locations: addLocation ownership + quota (issue #499).
 *
 * The multi-location action from #290 had three gaps, same class as #244
 * (check-then-act on quota):
 *   1. Check-then-act on the location limit — two concurrent submits could
 *      both pass the check and both insert, exceeding maxLocations.
 *   2. The count included every user_restaurants row for this user,
 *      including restaurants they were invited to by another tenant.
 *   3. No owner check — any member of a Business-tier restaurant could
 *      create new locations billed to the parent and make themselves owner.
 *
 * DB-backed: the db singleton is swapped for the real test client so the
 * transaction + pg_advisory_xact_lock path runs against real Postgres.
 * Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant, runAsSystem: (fn: () => unknown) => fn(), runWithTenantContext: (_rid: unknown, fn: () => unknown) => fn() };
});

import { testSql, closeDb, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { memoizeEntitlements, TIERS } from '../src/lib/server/billing';
import { actions } from '../src/routes/(app)/settings/+page.server';

const MAX_LOCATIONS = TIERS.business.maxLocations;

let parentId = '';
let ownerId = '';
let memberId = '';
let foreignId = '';

async function makeRestaurant(nameSuffix: string, parent?: string) {
	const slug = `test-vitest-addloc-${nameSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const [row] = parent
		? await testSql`INSERT INTO restaurants (name, slug, parent_id) VALUES (${'Loc ' + nameSuffix}, ${slug}, ${parent}) RETURNING id`
		: await testSql`INSERT INTO restaurants (name, slug) VALUES (${'Loc ' + nameSuffix}, ${slug}) RETURNING id`;
	return row.id as string;
}

async function makeUser(nameSuffix: string) {
	const email = `addloc-${nameSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
	const [row] = await testSql`INSERT INTO users (email, name) VALUES (${email}, ${'Chef ' + nameSuffix}) RETURNING id`;
	return row.id as string;
}

async function membership(userId: string, restaurantId: string, role: 'owner' | 'member') {
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${userId}, ${restaurantId}, ${role})`;
}

async function setBusinessTier(restaurantId: string) {
	await testSql`
		INSERT INTO subscriptions (restaurant_id, plan_tier, status)
		VALUES (${restaurantId}, 'business', 'active')
		ON CONFLICT (restaurant_id) DO UPDATE SET plan_tier = 'business', status = 'active'
	`;
}

/** Group size the way BILLING_PARENT / countGroupLocations define it: parent + its children. */
async function groupCount(billingRid: string) {
	const rows = await testSql`
		SELECT id FROM restaurants WHERE id = ${billingRid} OR parent_id = ${billingRid}
	`;
	return rows.length;
}

/**
 * Grows or shrinks the parent's group of locations to exactly `size`,
 * mirroring what addLocation itself does: every filler child also gets an
 * owner user_restaurants row for `ownerId`, so the owner's total membership
 * count (parent + foreign + N children) legitimately outgrows the group's
 * own size — which is exactly the discrepancy issue #499 is about.
 */
async function resetGroupToSize(billingRid: string, size: number) {
	while ((await groupCount(billingRid)) > size) {
		const [row] = await testSql`SELECT id FROM restaurants WHERE parent_id = ${billingRid} ORDER BY created_at DESC LIMIT 1`;
		await testSql`DELETE FROM restaurants WHERE id = ${row.id}`;
	}
	while ((await groupCount(billingRid)) < size) {
		const childId = await makeRestaurant(`filler-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, billingRid);
		await membership(ownerId, childId, 'owner');
	}
}

function locals(userId: string, restaurantId: string) {
	return {
		restaurantId,
		user: { id: userId, email: 'addloc@example.test', name: 'Chef', image: null },
		entitlements: memoizeEntitlements(restaurantId),
		lockedRestaurantIds: [] as string[],
	};
}

type ActionResult =
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'fail'; status: number; data: { section?: string; error?: string } }
	| { kind: 'other'; value: unknown };

async function runAddLocation(userId: string, restaurantId: string, name: string): Promise<ActionResult> {
	const body = new FormData();
	body.append('name', name);
	const request = new Request('http://localhost/settings?/addLocation', { method: 'POST', body });
	try {
		const value = await (actions.addLocation as (e: unknown) => Promise<unknown>)({
			request,
			locals: locals(userId, restaurantId),
			cookies: { set: vi.fn(), delete: vi.fn() },
		});
		if (value && typeof value === 'object' && 'status' in value && 'data' in value) {
			const v = value as { status: number; data: { section?: string; error?: string } };
			return { kind: 'fail', status: v.status, data: v.data };
		}
		return { kind: 'other', value };
	} catch (thrown) {
		const t = thrown as { status?: number; location?: string };
		if (typeof t.status === 'number' && typeof t.location === 'string') {
			return { kind: 'redirect', status: t.status, location: t.location };
		}
		throw thrown;
	}
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	parentId = await makeRestaurant('parent');
	await setBusinessTier(parentId);

	ownerId = await makeUser('owner');
	await membership(ownerId, parentId, 'owner');

	memberId = await makeUser('member');
	await membership(memberId, parentId, 'member');

	foreignId = await makeRestaurant('foreign');
	await membership(ownerId, foreignId, 'owner');
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(parentId);
	await cleanupTestRestaurant(foreignId);
	if (ownerId) await testSql`DELETE FROM users WHERE id = ${ownerId}`;
	if (memberId) await testSql`DELETE FROM users WHERE id = ${memberId}`;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('addLocation ownership + quota scoping (issue #499)', () => {
	it('rejects a non-owner member with 403 set.locations.err.notOwner and inserts nothing', async () => {
		await resetGroupToSize(parentId, 1);
		const before = await groupCount(parentId);

		const result = await runAddLocation(memberId, parentId, 'Sucursal Norte');

		expect(result.kind).toBe('fail');
		if (result.kind === 'fail') {
			expect(result.status).toBe(403);
			expect(result.data.section).toBe('location');
			expect(result.data.error).toBe('set.locations.err.notOwner');
		}
		expect(await groupCount(parentId)).toBe(before);
	});

	it('scopes the location count to the billing parent, not every membership row for the user', async () => {
		await resetGroupToSize(parentId, MAX_LOCATIONS - 1);
		const before = await groupCount(parentId);
		expect(before).toBe(MAX_LOCATIONS - 1);

		const memberships = await testSql`SELECT restaurant_id FROM user_restaurants WHERE user_id = ${ownerId}`;
		expect(memberships.length).toBeGreaterThan(before);
		expect(memberships.length).toBeGreaterThanOrEqual(MAX_LOCATIONS);

		const result = await runAddLocation(ownerId, parentId, 'Sucursal Este');

		expect(result.kind).toBe('redirect');
		if (result.kind === 'redirect') {
			expect(result.status).toBe(303);
			expect(result.location).toBe('/');
		}
		expect(await groupCount(parentId)).toBe(before + 1);
	});

	it(`rejects addLocation once the billing group is at maxLocations (business = ${MAX_LOCATIONS})`, async () => {
		await resetGroupToSize(parentId, MAX_LOCATIONS);

		const result = await runAddLocation(ownerId, parentId, 'One Too Many');

		expect(result.kind).toBe('fail');
		if (result.kind === 'fail') {
			expect(result.status).toBe(403);
			expect(result.data.section).toBe('location');
			expect(result.data.error).toBe('set.locations.err.limitReached');
		}
		expect(await groupCount(parentId)).toBe(MAX_LOCATIONS);
	});

	it('two parallel addLocation calls at the limit: exactly one succeeds', async () => {
		await resetGroupToSize(parentId, MAX_LOCATIONS - 1);
		expect(await groupCount(parentId)).toBe(MAX_LOCATIONS - 1);

		const [a, b] = await Promise.all([
			runAddLocation(ownerId, parentId, 'Parallel A'),
			runAddLocation(ownerId, parentId, 'Parallel B'),
		]);

		const outcomes = [a, b];
		const succeeded = outcomes.filter((r) => r.kind === 'redirect');
		const limited = outcomes.filter((r) => r.kind === 'fail');

		expect(succeeded).toHaveLength(1);
		expect(limited).toHaveLength(1);
		const rejected = limited[0];
		if (rejected.kind === 'fail') {
			expect(rejected.status).toBe(403);
			expect(rejected.data.error).toBe('set.locations.err.limitReached');
		}

		expect(await groupCount(parentId)).toBe(MAX_LOCATIONS);
	});
});
