/**
 * Settings → Categories: owner-gated add/rename/hide actions (issue #881 part 3).
 *
 * `src/lib/server/categories.ts` (part 1) and its rewired consumers (part 2)
 * are covered in `tests/supplier-category.test.ts`'s "per-restaurant
 * categories (issue #881)" block — creation, duplicate/reserved/invalid
 * rejection, rename propagation, hidden-row exclusion. This file only covers
 * the settings-screen wiring added in part 3: the `addCategory`,
 * `renameCategory` and `setCategoryHidden` actions delegate to that module,
 * gate every mutation on the caller being the restaurant's owner (categories
 * are shared, tenant-wide classification data — the same bar as renaming the
 * restaurant or adding a location), map its typed `reason` onto the right
 * i18n error key, and `load` exposes the restaurant's own rows (default and
 * custom, visible and hidden) plus `canManageCategories`.
 *
 * DB-backed: the db singleton is swapped for the test client. Skipped
 * without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { runFormAction, type ActionResult } from './helpers/action-result';
import { memoizeEntitlements } from '../src/lib/server/billing';
import { actions, load } from '../src/routes/(app)/settings/+page.server';

let rid = '';
let ownerId = '';
let memberId = '';

function locals(userId: string) {
	return {
		restaurantId: rid,
		user: { id: userId, email: 'categories@example.test', name: 'Chef', image: null },
		entitlements: memoizeEntitlements(rid),
		lockedRestaurantIds: [] as string[],
	};
}

type CategoryFormResult = ActionResult<{ section?: string; ok?: string }>;

function runAction(name: keyof typeof actions, userId: string, fields: Record<string, string>): Promise<CategoryFormResult> {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	const request = new Request(`http://localhost/settings?/${name}`, { method: 'POST', body });
	return runFormAction(actions[name] as (e: unknown) => Promise<unknown>, { request, locals: locals(userId) });
}

function expectNotOwnerRejection(result: CategoryFormResult) {
	expect(result).toMatchObject({ kind: 'fail', status: 403, data: { section: 'categorias', error: 'set.categories.err.notOwner' } });
}

async function loadCategories(userId: string) {
	const data = await (load as (e: unknown) => Promise<Record<string, unknown>>)({ locals: locals(userId) });
	return data.categories as Array<{ id: number; name: string; hidden: boolean; isDefault: boolean }>;
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('settings-categories');
	rid = r.id;

	const ownerEmail = `cat-owner-${Date.now()}@example.com`;
	const [owner] = await testSql`INSERT INTO users (email, name) VALUES (${ownerEmail}, ${'Owner'}) RETURNING id`;
	ownerId = owner.id;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${ownerId}, ${rid}, 'owner')`;

	const memberEmail = `cat-member-${Date.now()}@example.com`;
	const [member] = await testSql`INSERT INTO users (email, name) VALUES (${memberEmail}, ${'Member'}) RETURNING id`;
	memberId = member.id;
	await testSql`INSERT INTO user_restaurants (user_id, restaurant_id, role) VALUES (${memberId}, ${rid}, 'member')`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	if (ownerId) await testSql`DELETE FROM users WHERE id = ${ownerId}`;
	if (memberId) await testSql`DELETE FROM users WHERE id = ${memberId}`;
	await closeDb();
});

describe.skipIf(!hasDbEnv)('settings load exposes the restaurant\'s categories (issue #881 part 3)', () => {
	it('returns the seeded default categories and the owner-only management flag', async () => {
		const data = await (load as (e: unknown) => Promise<Record<string, unknown>>)({ locals: locals(ownerId) });
		const rows = data.categories as Array<{ id: number; name: string; hidden: boolean; isDefault: boolean }>;
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((c) => c.isDefault)).toBe(true);
		expect(rows.every((c) => !c.hidden)).toBe(true);
		expect(data.canManageCategories).toBe(true);

		const memberData = await (load as (e: unknown) => Promise<Record<string, unknown>>)({ locals: locals(memberId) });
		expect(memberData.canManageCategories).toBe(false);
	});
});

describe.skipIf(!hasDbEnv)('addCategory action (issue #881 part 3)', () => {
	it('rejects a non-owner member and adds nothing', async () => {
		const before = await loadCategories(ownerId);
		expectNotOwnerRejection(await runAction('addCategory', memberId, { name: 'Marketing' }));
		expect(await loadCategories(ownerId)).toHaveLength(before.length);
	});

	it('lets the owner add a custom category, visible and not default', async () => {
		const result = await runAction('addCategory', ownerId, { name: 'Marketing' });
		expect(result).toMatchObject({ kind: 'ok', value: { section: 'categorias', ok: 'set.categories.ok.added' } });

		const rows = await loadCategories(ownerId);
		const added = rows.find((c) => c.name === 'Marketing');
		expect(added).toBeDefined();
		expect(added!.isDefault).toBe(false);
		expect(added!.hidden).toBe(false);
	});

	it('rejects a duplicate name with 422 set.categories.err.duplicate', async () => {
		const result = await runAction('addCategory', ownerId, { name: 'marketing' });
		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { section: 'categorias', error: 'set.categories.err.duplicate' } });
	});

	it('rejects "Other" with 422 set.categories.err.reserved', async () => {
		const result = await runAction('addCategory', ownerId, { name: 'Other' });
		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { section: 'categorias', error: 'set.categories.err.reserved' } });
	});

	it('rejects an empty name with 422 set.categories.err.invalid', async () => {
		const result = await runAction('addCategory', ownerId, { name: '   ' });
		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { section: 'categorias', error: 'set.categories.err.invalid' } });
	});
});

describe.skipIf(!hasDbEnv)('renameCategory action (issue #881 part 3)', () => {
	it('rejects a non-owner member and renames nothing', async () => {
		const [target] = await loadCategories(ownerId);
		expectNotOwnerRejection(await runAction('renameCategory', memberId, { id: String(target.id), name: 'Hijacked' }));
		expect((await loadCategories(ownerId)).find((c) => c.id === target.id)!.name).toBe(target.name);
	});

	it('rejects a non-numeric id with 422 set.categories.err.invalid', async () => {
		const result = await runAction('renameCategory', ownerId, { id: 'nope', name: 'Whatever' });
		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { section: 'categorias', error: 'set.categories.err.invalid' } });
	});

	it('lets the owner rename a category', async () => {
		const rows = await loadCategories(ownerId);
		const target = rows.find((c) => c.name === 'Marketing')!;

		const result = await runAction('renameCategory', ownerId, { id: String(target.id), name: 'Marketing & Ads' });
		expect(result).toMatchObject({ kind: 'ok', value: { section: 'categorias', ok: 'set.categories.ok.renamed' } });
		expect((await loadCategories(ownerId)).find((c) => c.id === target.id)!.name).toBe('Marketing & Ads');
	});

	it('rejects renaming onto an existing name with 422 set.categories.err.duplicate', async () => {
		const rows = await loadCategories(ownerId);
		const target = rows.find((c) => c.name === 'Marketing & Ads')!;
		const other = rows.find((c) => c.id !== target.id)!;

		const result = await runAction('renameCategory', ownerId, { id: String(target.id), name: other.name });
		expect(result).toMatchObject({ kind: 'fail', status: 422, data: { section: 'categorias', error: 'set.categories.err.duplicate' } });
	});
});

describe.skipIf(!hasDbEnv)('setCategoryHidden action (issue #881 part 3)', () => {
	it('rejects a non-owner member and hides nothing', async () => {
		const rows = await loadCategories(ownerId);
		const target = rows.find((c) => c.name === 'Marketing & Ads')!;

		expectNotOwnerRejection(await runAction('setCategoryHidden', memberId, { id: String(target.id), hidden: '1' }));
		expect((await loadCategories(ownerId)).find((c) => c.id === target.id)!.hidden).toBe(false);
	});

	it('lets the owner hide, then show, a category', async () => {
		const rows = await loadCategories(ownerId);
		const target = rows.find((c) => c.name === 'Marketing & Ads')!;

		const hideResult = await runAction('setCategoryHidden', ownerId, { id: String(target.id), hidden: '1' });
		expect(hideResult).toMatchObject({ kind: 'ok', value: { section: 'categorias', ok: 'set.categories.ok.hidden' } });
		expect((await loadCategories(ownerId)).find((c) => c.id === target.id)!.hidden).toBe(true);

		const showResult = await runAction('setCategoryHidden', ownerId, { id: String(target.id), hidden: '0' });
		expect(showResult).toMatchObject({ kind: 'ok', value: { section: 'categorias', ok: 'set.categories.ok.shown' } });
		expect((await loadCategories(ownerId)).find((c) => c.id === target.id)!.hidden).toBe(false);
	});
});
