/**
 * numeric(12,2) money columns (issue #477) — end-to-end precision checks
 * against a real Postgres instance.
 *
 * float4 (`real`) has ~6-7 significant decimal digits: a large invoice total
 * couldn't round-trip exactly, and SUM over many line items compounded
 * error. numeric(12,2) fixes both — these tests pin that against the actual
 * database, not just the JS-side helper.
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	testDb, testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { invoices, invoiceLineItems, suppliers } from '../src/lib/server/schema';
import { sumCents, fromCents } from '../src/lib/server/money';

let restaurantId = '';
let supplierId = 0;

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('money-precision');
	restaurantId = r.id;
	const [s] = await testDb.insert(suppliers)
		.values({ restaurantId, name: 'Money Precision Supplier' })
		.returning({ id: suppliers.id });
	supplierId = s!.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(restaurantId);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('numeric(12,2) — large invoice round-trip', () => {
	it('stores and reads back €123,456.78 exactly', async () => {
		const [row] = await testDb.insert(invoices).values({
			restaurantId,
			supplierId,
			invoiceNumber: 'MONEY-ROUNDTRIP-001',
			invoiceDate:   '2026-01-15',
			totalAmount:   '123456.78',
			status:        'pending',
		}).returning();

		const [read] = await testDb.select({ totalAmount: invoices.totalAmount })
			.from(invoices)
			.where(eq(invoices.id, row!.id));

		// float4 (the pre-migration `real` type) cannot hold this value's cents
		// exactly above ~6-7 significant digits — this asserts the exact string
		// survives, not an approximation.
		expect(read!.totalAmount).toBe('123456.78');
	});

	it('stores and reads back a value beyond float4 precision (€1,234,567.89)', async () => {
		const [row] = await testDb.insert(invoices).values({
			restaurantId,
			supplierId,
			invoiceNumber: 'MONEY-ROUNDTRIP-002',
			invoiceDate:   '2026-01-16',
			totalAmount:   '1234567.89',
			status:        'pending',
		}).returning();

		const [read] = await testDb.select({ totalAmount: invoices.totalAmount })
			.from(invoices)
			.where(eq(invoices.id, row!.id));

		expect(read!.totalAmount).toBe('1234567.89');
	});
});

describe.skipIf(!hasDbEnv)('numeric(12,2) — SUM over many line items is exact', () => {
	it('SUM(total_price) across many line items matches the exact expected total', async () => {
		const [inv] = await testDb.insert(invoices).values({
			restaurantId,
			supplierId,
			invoiceNumber: 'MONEY-SUM-001',
			invoiceDate:   '2026-01-17',
			status:        'pending',
		}).returning();

		// Amounts chosen so naive float64 accumulation would drift from the
		// exact cent total — SUM must be done in Postgres numeric arithmetic.
		const lineTotals = [
			...Array.from({ length: 200 }, () => '0.01'),
			'19.99', '4.99', '0.10', '0.20', '9999.99',
		];
		const expectedTotalCents = sumCents(lineTotals);
		const expectedTotal = fromCents(expectedTotalCents);

		await testDb.insert(invoiceLineItems).values(
			lineTotals.map((totalPrice, i) => ({
				restaurantId,
				invoiceId: inv!.id,
				description: `Item ${i}`,
				unitPrice: totalPrice,
				totalPrice,
				quantity: 1,
			})),
		);

		const [_sumRow] = await testSql<{ sum: string }[]>`
			SELECT COALESCE(SUM(total_price), 0)::text AS sum
			FROM invoice_line_items
			WHERE invoice_id = ${inv!.id}
		`;
		const { sum } = _sumRow!;

		expect(sum).toBe(expectedTotal);
		expect(expectedTotal).toBe('10027.27');
	});
});
