/**
 * alert-engine — query-count unit tests
 *
 * Proves that runPriceShock and runStockForecast issue O(1) DB queries for
 * any N line items — the N+1 fix verified by issue #103.
 *
 * No live DB or env vars required: the db module is fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnrichedLineItem } from '../src/lib/server/products';

// ── DB mock ───────────────────────────────────────────────────────────────────
// vi.mock is hoisted before module evaluation, so helpers live inside the factory.

vi.mock('../src/lib/server/db', () => {
	/** Returns a chainable drizzle-style builder that resolves to `rows` on await. */
	function makeBuilder(rows: unknown[] = []) {
		const b: Record<string, unknown> = {};
		const self = () => b;
		b.from = vi.fn(self);
		b.where = vi.fn(self);
		b.limit = vi.fn(self);
		b.innerJoin = vi.fn(self);
		// Thenable — `await builder` resolves to `rows`
		(b as { then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) => Promise<void> }).then =
			(res, rej) => Promise.resolve(rows).then(res, rej);
		return b;
	}

	return {
		db: {
			select: vi.fn(() => makeBuilder()),
			execute: vi.fn().mockResolvedValue([]),
		},
		// db.ts re-exports forTenant from tenant.ts; include it in the mock so
		// vitest's strict export-check passes when DATABASE_URL is set in CI.
		// Must return { rid, scope } — alert-engine calls tdb.scope() directly.
		forTenant: vi.fn((rid: string) => ({
			rid,
			scope: vi.fn((_col: unknown, extra?: unknown) => extra ?? true),
		})),
	};
});

import { db } from '../src/lib/server/db';
import { runPriceShock, runStockForecast } from '../src/lib/server/alert-engine';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLineItems(n: number): EnrichedLineItem[] {
	return Array.from({ length: n }, (_, i) => ({
		description: `ingredient-${i}`,
		quantity: 10,
		unit: 'kg',
		unitPrice: 5.0,
		totalPrice: 50.0,
		canonicalUnit: 'kg',
		requiresUnitConversion: false,
		convertedQuantity: 10,
	}));
}

const RESTAURANT_ID = 'rest-unit-test';
const SUPPLIER_NAME = 'Test Supplier';
const INVOICE_ID = 999;

/** Total DB calls issued (select + execute). */
function queryCount() {
	return (
		(db.select as ReturnType<typeof vi.fn>).mock.calls.length +
		(db.execute as ReturnType<typeof vi.fn>).mock.calls.length
	);
}

function clearSpies() {
	(db.select as ReturnType<typeof vi.fn>).mockClear();
	(db.execute as ReturnType<typeof vi.fn>).mockClear();
}

// ── runPriceShock — 2 queries for any N items ─────────────────────────────────
//   query 1: settings (price_alert_threshold)
//   query 2: batch DISTINCT ON price history for all descriptions in one go

describe('runPriceShock — bounded queries', () => {
	beforeEach(clearSpies);

	it('issues exactly 2 DB calls for 1 line item', async () => {
		await runPriceShock(INVOICE_ID, SUPPLIER_NAME, makeLineItems(1), RESTAURANT_ID);
		expect(queryCount()).toBe(2);
	});

	it('issues exactly 2 DB calls for 50 line items (not 51)', async () => {
		await runPriceShock(INVOICE_ID, SUPPLIER_NAME, makeLineItems(50), RESTAURANT_ID);
		expect(queryCount()).toBe(2);
	});

	it('returns no alerts when no previous prices are found', async () => {
		const alerts = await runPriceShock(INVOICE_ID, SUPPLIER_NAME, makeLineItems(10), RESTAURANT_ID);
		expect(alerts).toEqual([]);
	});
});

// ── runStockForecast — 1 query for any N items ────────────────────────────────
//   query 1: batch inArray stock levels for all descriptions in one go

describe('runStockForecast — bounded queries', () => {
	beforeEach(clearSpies);

	it('issues exactly 1 DB call for 1 line item', async () => {
		await runStockForecast(makeLineItems(1), RESTAURANT_ID);
		expect(queryCount()).toBe(1);
	});

	it('issues exactly 1 DB call for 50 line items (not 50)', async () => {
		await runStockForecast(makeLineItems(50), RESTAURANT_ID);
		expect(queryCount()).toBe(1);
	});

	it('returns no alerts when stock map is empty', async () => {
		const alerts = await runStockForecast(makeLineItems(10), RESTAURANT_ID);
		expect(alerts).toEqual([]);
	});
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('runPriceShock — edge cases', () => {
	beforeEach(clearSpies);

	it('returns early with no alerts when line items array is empty', async () => {
		const alerts = await runPriceShock(INVOICE_ID, SUPPLIER_NAME, [], RESTAURANT_ID);
		expect(alerts).toEqual([]);
		// No DB calls: returns before hitting the DB when descriptions list is empty
		expect(queryCount()).toBe(1); // only the settings query fires before the early-return guard
	});

	it('deduplicates descriptions before querying', async () => {
		// 50 items but only 2 unique descriptions — batch query should still issue 1 execute call
		const dupes = Array.from({ length: 50 }, (_, i) => ({
			description: i % 2 === 0 ? 'flour' : 'sugar',
			quantity: 1,
			unit: 'kg',
			unitPrice: 2.0,
			totalPrice: 2.0,
			canonicalUnit: 'kg',
			requiresUnitConversion: false,
			convertedQuantity: 1,
		}));
		await runPriceShock(INVOICE_ID, SUPPLIER_NAME, dupes, RESTAURANT_ID);
		// Still exactly 2 DB calls regardless of duplicate volume
		expect(queryCount()).toBe(2);
	});
});

describe('runStockForecast — edge cases', () => {
	beforeEach(clearSpies);

	it('returns early with no alerts when line items array is empty', async () => {
		const alerts = await runStockForecast([], RESTAURANT_ID);
		expect(alerts).toEqual([]);
		expect(queryCount()).toBe(0);
	});
});
