/**
 * Tenant isolation tests for forTenant().
 *
 * Proves that forTenant(ridX).scope() cannot surface rows belonging to a
 * different tenant — the automated proof required by ADR-001 / issue #120.
 *
 * Requires a live Supabase connection; skipped automatically in CI when
 * SUPABASE env vars are absent (same pattern as supabase-crud.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testDb, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasSupabaseEnv,
} from './helpers/test-db';
import { suppliers } from '../src/lib/server/schema';
import { forTenant } from '../src/lib/server/tenant';

let rid1 = '', rid2 = '';

beforeAll(async () => {
	if (!hasSupabaseEnv) return;
	const r1 = await createTestRestaurant('iso-a');
	const r2 = await createTestRestaurant('iso-b');
	rid1 = r1.id;
	rid2 = r2.id;
	await testDb.insert(suppliers).values({ restaurantId: rid1, name: '__iso_supplier_a__' });
});

afterAll(async () => {
	if (!hasSupabaseEnv) return;
	await cleanupTestRestaurant(rid1);
	await cleanupTestRestaurant(rid2);
	await closeDb();
});

describe.skipIf(!hasSupabaseEnv)('forTenant() — cross-tenant isolation', () => {
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
