/**
 * Issue #524 — `sql` templates over numeric(12,2) money columns must not lie
 * about their return type. postgres.js parses `numeric` columns as strings
 * (to avoid float rounding on arbitrary precision); a `sql<number>` site only
 * gets a real JS number back when the SQL expression itself is cast to
 * `::float8` (or `::int`/`::integer` for whole-number aggregates).
 *
 * These are DB-backed spot checks (not just type-level) that the fixed sites
 * genuinely return `typeof value === 'number'` against a real Postgres
 * connection, and a control case showing the same query WITHOUT the cast
 * comes back as a string — the exact bug the issue describes.
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { invoiceLineItems, invoices, suppliers } from '../src/lib/server/schema';
import { sql, eq } from 'drizzle-orm';
import { lineAmountExpr } from '../src/lib/server/category-spend';
import { supplierTotalSpendExpr } from '../src/lib/server/supplier-list-query';

const describeDb = hasDbEnv ? describe : describe.skip;

describeDb('sql<number> money aggregates return real numbers, not strings (issue #524)', () => {
	let restaurantId: string;
	let supplierId: number;

	beforeAll(async () => {
		({ id: restaurantId } = await createTestRestaurant('money-numeric-honesty'));
		const [supplier] = await testDb.insert(suppliers)
			.values({ restaurantId, name: 'Proveedor Test' })
			.returning({ id: suppliers.id });
		supplierId = supplier.id;

		const [invoice] = await testDb.insert(invoices)
			.values({ restaurantId, supplierId, invoiceNumber: 'MNH-1', invoiceDate: '2026-01-15', totalAmount: '99.99', status: 'pending' })
			.returning({ id: invoices.id });

		await testDb.insert(invoiceLineItems).values({
			restaurantId, invoiceId: invoice.id, description: 'Artículo de prueba',
			quantity: 1, unit: 'ud', unitPrice: '99.99', totalPrice: '99.99',
		});
	});

	afterAll(async () => {
		await cleanupTestRestaurant(restaurantId);
		await closeDb();
	});

	it('control: an uncast numeric SUM comes back as a string from postgres.js', async () => {
		const [row] = await testSql`
			SELECT COALESCE(SUM(total_amount), 0) AS total FROM invoices WHERE restaurant_id = ${restaurantId}
		`;
		expect(typeof row.total).toBe('string');
		expect(row.total).toBe('99.99');
	});

	it('fixed: the same SUM cast ::float8 comes back as a real number', async () => {
		const [row] = await testSql`
			SELECT COALESCE(SUM(total_amount), 0)::float8 AS total FROM invoices WHERE restaurant_id = ${restaurantId}
		`;
		expect(typeof row.total).toBe('number');
		expect(row.total).toBe(99.99);
	});

	it('supplierTotalSpendExpr() (suppliers list "total_spend") returns a real number', async () => {
		const [row] = await testDb
			.select({ total: supplierTotalSpendExpr() })
			.from(suppliers)
			.leftJoin(invoices, eq(invoices.supplierId, suppliers.id))
			.where(eq(suppliers.id, supplierId))
			.groupBy(suppliers.id);
		expect(typeof row.total).toBe('number');
		expect(row.total).toBe(99.99);
	});

	it('lineAmountExpr() aggregate (dashboard/trend category spend) returns a real number when cast ::float8', async () => {
		const [row] = await testDb
			.select({ amount: sql<number>`COALESCE(SUM(${lineAmountExpr()}), 0)::float8` })
			.from(invoiceLineItems)
			.where(eq(invoiceLineItems.restaurantId, restaurantId));
		expect(typeof row.amount).toBe('number');
		expect(row.amount).toBe(99.99);
	});
});
