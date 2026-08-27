/**
 * Spend-trend category bucketing (issue #301) — and a regression guard for the
 * query that fed it.
 *
 * The trend query used to build `COALESCE(suppliers.category, 'Other')` twice,
 * once in SELECT and once in GROUP BY. Drizzle binds the sentinel as a fresh
 * parameter on each occurrence, so Postgres saw `COALESCE(x,$1)` grouped by
 * `COALESCE(x,$4)`, decided they were different expressions, and rejected the
 * statement — every dashboard load 500'd. Only a real database catches that:
 * it type-checks fine and the shape of the returned data is unchanged.
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testDb, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { invoiceLineItems, invoices, suppliers } from '../src/lib/server/schema';
import { getTrendDataByRange } from '../src/lib/server/trend';
import { UNCATEGORIZED_CATEGORY } from '../src/lib/constants';

const describeDb = hasDbEnv ? describe : describe.skip;

describeDb('spend trend — category buckets', () => {
	let restaurantId: string;

	beforeAll(async () => {
		({ id: restaurantId } = await createTestRestaurant('trend-categories'));
		const now = new Date();
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

		const [uncategorized] = await testDb.insert(suppliers)
			.values({ restaurantId, name: 'Sin Clasificar', category: null })
			.returning({ id: suppliers.id });
		const [explicitOther] = await testDb.insert(suppliers)
			.values({ restaurantId, name: 'Varios SL', category: UNCATEGORIZED_CATEGORY })
			.returning({ id: suppliers.id });
		const [produce] = await testDb.insert(suppliers)
			.values({ restaurantId, name: 'Frutas Gómez', category: 'Frutas y Verduras' })
			.returning({ id: suppliers.id });

		// Spend is attributed line by line, so each invoice needs a line to carry it.
		// None of these lines is linked to a product, which is also the fallback case:
		// COALESCE(products.category, suppliers.category, 'Other') lands on the tag.
		const inserted = await testDb.insert(invoices).values([
			{ restaurantId, supplierId: uncategorized.id, invoiceNumber: 'T-NULL', invoiceDate: today, totalAmount: '400.00', status: 'pending' },
			{ restaurantId, supplierId: explicitOther.id, invoiceNumber: 'T-OTHER', invoiceDate: today, totalAmount: '150.00', status: 'pending' },
			{ restaurantId, supplierId: produce.id, invoiceNumber: 'T-FRUIT', invoiceDate: today, totalAmount: '90.00', status: 'pending' },
		]).returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

		const idOf = (number: string) => inserted.find((i) => i.invoiceNumber === number)!.id;
		await testDb.insert(invoiceLineItems).values([
			{ restaurantId, invoiceId: idOf('T-NULL'), description: 'Género varios', quantity: 1, unit: 'ud', unitPrice: '400.00', totalPrice: '400.00' },
			{ restaurantId, invoiceId: idOf('T-OTHER'), description: 'Suministros', quantity: 1, unit: 'ud', unitPrice: '150.00', totalPrice: '150.00' },
			{ restaurantId, invoiceId: idOf('T-FRUIT'), description: 'Tomate pera', quantity: 1, unit: 'kg', unitPrice: '90.00', totalPrice: '90.00' },
		]);
	});

	afterAll(async () => {
		await cleanupTestRestaurant(restaurantId);
		await closeDb();
	});

	/** Segments of the bucket covering today. */
	async function currentSegments(granularity: string) {
		const data = await getTrendDataByRange(restaurantId, '30d', granularity);
		const current = data.buckets.find((b) => b.is_current);
		expect(current, 'no bucket covers today').toBeDefined();
		return current!.segments;
	}

	it('runs at all — the GROUP BY regression made this throw', async () => {
		await expect(getTrendDataByRange(restaurantId, '30d', 'weekly')).resolves.toBeDefined();
	});

	it('folds uncategorised spend into the same bucket as an explicit "Other"', async () => {
		const segments = await currentSegments('weekly');
		const other = segments.filter((s) => s.category === UNCATEGORIZED_CATEGORY);

		// One segment, not two — otherwise the chart stacks 'Other' twice and the
		// legend repeats it.
		expect(other).toHaveLength(1);
		expect(other[0].amount).toBe(550);
	});

	it('never emits a bare null category', async () => {
		const segments = await currentSegments('weekly');
		expect(segments.map((s) => s.category)).not.toContain(null);
	});

	it('keeps real categories separate from the uncategorised bucket', async () => {
		const segments = await currentSegments('weekly');
		const produce = segments.find((s) => s.category === 'Frutas y Verduras');
		expect(produce?.amount).toBe(90);
	});

	it('totals the bucket across every category', async () => {
		const data = await getTrendDataByRange(restaurantId, '30d', 'weekly');
		expect(data.buckets.find((b) => b.is_current)!.total).toBe(640);
	});

	it('works at every granularity', async () => {
		// daily/monthly use different key expressions in the same GROUP BY.
		for (const granularity of ['daily', 'weekly', 'monthly']) {
			const segments = await currentSegments(granularity);
			const other = segments.filter((s) => s.category === UNCATEGORIZED_CATEGORY);
			expect(other, `granularity ${granularity}`).toHaveLength(1);
			expect(other[0].amount, `granularity ${granularity}`).toBe(550);
		}
	});
});
