/**
 * Tenant isolation tests for forTenant().
 *
 * Proves that forTenant(ridX).scope() cannot surface rows belonging to a
 * different tenant — the automated proof required by ADR-001 / issue #120.
 *
 * Requires a live DB connection; skipped automatically in CI when
 * DB env vars are absent (same pattern as the other DB suites).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import {
	testDb, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { suppliers } from '../src/lib/server/schema';
import { forTenant } from '../src/lib/server/tenant';
import { createBatchStore } from '../src/lib/server/batch';

let rid1 = '', rid2 = '';
let ownedItemId = '', ownedBatchId = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r1 = await createTestRestaurant('iso-a');
	const r2 = await createTestRestaurant('iso-b');
	rid1 = r1.id;
	rid2 = r2.id;
	await testDb.insert(suppliers).values({ restaurantId: rid1, name: '__iso_supplier_a__' });

	const store = createBatchStore(testDb);
	const { batchId, itemIds } = await store.createBatch(rid1, [{ key: 'ns/a.pdf', name: 'a.pdf' }]);
	ownedBatchId = batchId;
	ownedItemId = itemIds[0];
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid1);
	await cleanupTestRestaurant(rid2);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('forTenant() — cross-tenant isolation', () => {
	it('returns the correct tenant\'s data', async () => {
		const tdb = forTenant(rid1);
		const rows = await testDb
			.select()
			.from(suppliers)
			.where(tdb.scope(suppliers.restaurantId));
		expect(rows.some((r) => r.name === '__iso_supplier_a__')).toBe(true);
		expect(rows.every((r) => r.restaurantId === rid1)).toBe(true);
	});

	it('cannot read another tenant\'s rows when scoped to a different restaurant', async () => {
		const tdb = forTenant(rid2);
		const rows = await testDb
			.select()
			.from(suppliers)
			.where(tdb.scope(suppliers.restaurantId));
		expect(rows.every((r) => r.restaurantId === rid2)).toBe(true);
		expect(rows.map((r) => r.name)).not.toContain('__iso_supplier_a__');
	});

	it('scope() composes with extra conditions', async () => {
		const tdb = forTenant(rid1);
		const { eq } = await import('drizzle-orm');
		const rows = await testDb
			.select()
			.from(suppliers)
			.where(tdb.scope(suppliers.restaurantId, eq(suppliers.name, '__iso_supplier_a__')));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.restaurantId).toBe(rid1);
	});

	it('throws when called with an empty restaurantId', () => {
		expect(() => forTenant('')).toThrow('restaurantId is required');
	});
});

describe.skipIf(!hasDbEnv)('/confirm/[id] and /extract/[id] loaders — tenant-scoped (issue #469)', () => {
	it('confirm/[id] redirects the owning tenant to the item\'s batch', async () => {
		const { load } = await import('../src/routes/(app)/confirm/[id]/+page.server');

		const outcome = await Promise.resolve(load({
			params: { id: ownedItemId },
			locals: { restaurantId: rid1 },
		} as never)).catch((e: unknown) => e);

		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { location: string }).location).toBe(`/batch/${ownedBatchId}`);
	});

	it('confirm/[id] redirects a different tenant to \'/\', not the batch', async () => {
		const { load } = await import('../src/routes/(app)/confirm/[id]/+page.server');

		const outcome = await Promise.resolve(load({
			params: { id: ownedItemId },
			locals: { restaurantId: rid2 },
		} as never)).catch((e: unknown) => e);

		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { location: string }).location).toBe('/');
	});

	it('extract/[id] redirects the owning tenant to the item\'s batch', async () => {
		const { load } = await import('../src/routes/(app)/extract/[id]/+page.server');

		const outcome = await Promise.resolve(load({
			params: { id: ownedItemId },
			locals: { restaurantId: rid1 },
		} as never)).catch((e: unknown) => e);

		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { location: string }).location).toBe(`/batch/${ownedBatchId}`);
	});

	it('extract/[id] redirects a different tenant to \'/\', not the batch', async () => {
		const { load } = await import('../src/routes/(app)/extract/[id]/+page.server');

		const outcome = await Promise.resolve(load({
			params: { id: ownedItemId },
			locals: { restaurantId: rid2 },
		} as never)).catch((e: unknown) => e);

		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { location: string }).location).toBe('/');
	});

	it('confirm/[id] redirects to \'/\' for a nonexistent item, same as a foreign one', async () => {
		const { load } = await import('../src/routes/(app)/confirm/[id]/+page.server');

		const outcome = await Promise.resolve(load({
			params: { id: '00000000-0000-0000-0000-000000000000' },
			locals: { restaurantId: rid1 },
		} as never)).catch((e: unknown) => e);

		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { location: string }).location).toBe('/');
	});
});
