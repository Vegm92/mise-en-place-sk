/**
 * Where the money's category comes from: the LINE, not the supplier.
 *
 * `mv_category_monthly_spend` and every category breakdown used to group by
 * `COALESCE(suppliers.category, 'Other')`, so a generalist wholesaler dropped
 * all of its euros into one bucket — usually "Other" — no matter what the
 * delivery note said. Attribution now runs through the line's product:
 *
 *     COALESCE(products.category, suppliers.category, 'Other')
 *
 * Three properties hold this together, and each has a test below:
 *
 *  1. NO-REGRESSION — when every supplier sells exactly one category, the new
 *     per-line split and the old per-supplier split agree to the cent. If they
 *     ever diverge for a mono-category tenant, the join is wrong.
 *  2. FALLBACK — a line with no product (product linking is stamped after the
 *     invoice transaction commits, an edit re-inserts lines, unlinkSupplier
 *     nulls them on purpose) must land in the supplier's bucket, not vanish.
 *     That is what makes the LEFT JOIN and the second COALESCE arm load-bearing.
 *  3. RECONCILIATION — category spend must add up to Σ invoices.total_amount
 *     when every line is described and priced. Line-level queries filter on a
 *     non-empty description and invoice-level ones do not, so that filter plus
 *     the unpriced lines are the ONLY reasons the dashboard's invoice totals
 *     and the analytics' line totals can drift apart. Nothing checked this
 *     before; the assertion belongs with the change that made it matter.
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import {
	testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { invoiceLineItems, invoices, products, suppliers } from '../src/lib/server/schema';
import {
	describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin,
} from '../src/lib/server/category-spend';
import { getTrendDataByRange } from '../src/lib/server/trend';
import { runBudgetCheck } from '../src/lib/server/alert-engine';
import { categoryBudgets } from '../src/lib/server/schema';
import { toMonthStr } from '../src/lib/formatters';
import { UNCATEGORIZED_CATEGORY } from '../src/lib/constants';

const describeDb = hasDbEnv ? describe : describe.skip;

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

const MONTH = '2026-03';
const DAY = '2026-03-12';

type Spend = Record<string, number>;

/** The criterion under test, read straight off the shared fragments. */
async function spendByLineCategory(rid: string, month: string): Promise<Spend> {
	const rows = await testDb.execute<{ category: string; total: string }>(sql`
		SELECT ${lineCategoryExpr()} AS category,
		       SUM(${lineAmountExpr()}) AS total
		FROM invoice_line_items
		JOIN invoices i ON i.id = invoice_line_items.invoice_id
		JOIN suppliers ON suppliers.id = i.supplier_id
		${lineProductJoin()}
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND ${describedLine()}
		  AND TO_CHAR(i.invoice_date, 'YYYY-MM') = ${month}
		GROUP BY ${lineCategoryExpr()}
	`);
	return Object.fromEntries(rows.map((r) => [String(r.category), Number(r.total)]));
}

/** The criterion this change replaced: the invoice's supplier decides. */
async function spendBySupplierCategory(rid: string, month: string): Promise<Spend> {
	const rows = await testDb.execute<{ category: string; total: string }>(sql`
		SELECT COALESCE(s.category, 'Other') AS category,
		       SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		JOIN suppliers s ON s.id = i.supplier_id
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND ili.description IS NOT NULL AND ili.description <> ''
		  AND TO_CHAR(i.invoice_date, 'YYYY-MM') = ${month}
		GROUP BY COALESCE(s.category, 'Other')
	`);
	return Object.fromEntries(rows.map((r) => [String(r.category), Number(r.total)]));
}

async function mvSpend(rid: string, month: string): Promise<Spend> {
	await testSql`SELECT refresh_analytics_rollups()`;
	const rows = await testDb.execute<{ category: string; total: string }>(sql`
		SELECT category, SUM(total_spend) AS total
		FROM mv_category_monthly_spend
		WHERE restaurant_id = ${rid} AND month = ${month}
		GROUP BY category
	`);
	return Object.fromEntries(rows.map((r) => [String(r.category), Number(r.total)]));
}

async function makeSupplier(rid: string, name: string, category: string | null): Promise<number> {
	const [row] = await testDb.insert(suppliers)
		.values({ restaurantId: rid, name, category })
		.returning({ id: suppliers.id });
	return row.id;
}

async function makeProduct(rid: string, name: string, category: string | null): Promise<number> {
	const [row] = await testDb.insert(products)
		.values({ restaurantId: rid, canonicalName: name, nameKey: name.toLowerCase(), category })
		.returning({ id: products.id });
	return row.id;
}

/** One invoice whose total_amount is exactly the sum of its lines. */
async function makeInvoice(
	rid: string,
	supplierId: number,
	number: string,
	lines: Array<{ description: string; productId: number | null; amount: number }>,
): Promise<number> {
	const total = lines.reduce((s, l) => s + l.amount, 0);
	const [inv] = await testDb.insert(invoices)
		.values({
			restaurantId: rid, supplierId, invoiceNumber: number,
			invoiceDate: DAY, totalAmount: total.toFixed(2), status: 'pending',
		})
		.returning({ id: invoices.id });
	for (const line of lines) {
		await testDb.insert(invoiceLineItems).values({
			restaurantId: rid, invoiceId: inv.id, productId: line.productId,
			description: line.description, quantity: 1, unit: 'ud',
			unitPrice: line.amount.toFixed(2), totalPrice: line.amount.toFixed(2),
		});
	}
	return inv.id;
}

describeDb('category attribution — the generalist wholesaler', () => {
	let rid: string;

	beforeAll(async () => {
		({ id: rid } = await createTestRestaurant('cat-attr-mixed'));

		const generalist = await makeSupplier(rid, 'Distribuciones Generales', UNCATEGORIZED_CATEGORY);
		const tomate = await makeProduct(rid, 'Tomate pera', 'Frutas y Verduras');
		const agua = await makeProduct(rid, 'Agua mineral', 'Bebidas');

		await makeInvoice(rid, generalist, 'G-1', [
			{ description: 'Tomate pera', productId: tomate, amount: 100 },
			{ description: 'Agua mineral', productId: agua, amount: 50 },
			{ description: 'Portes', productId: null, amount: 25 },
		]);
	});

	afterAll(async () => {
		await cleanupTestRestaurant(rid);
	});

	it('splits one supplier\'s invoice across the categories of its lines', async () => {
		const spend = await spendByLineCategory(rid, MONTH);
		expect(spend['Frutas y Verduras']).toBe(100);
		expect(spend['Bebidas']).toBe(50);
	});

	it('drops a line with no product into the supplier\'s bucket instead of losing it', async () => {
		const spend = await spendByLineCategory(rid, MONTH);
		expect(spend[UNCATEGORIZED_CATEGORY]).toBe(25);
	});

	it('is a strict refinement — the same total, split more finely', async () => {
		const byLine = await spendByLineCategory(rid, MONTH);
		const bySupplier = await spendBySupplierCategory(rid, MONTH);
		const sum = (s: Spend) => Object.values(s).reduce((a, b) => a + b, 0);

		expect(sum(byLine)).toBe(sum(bySupplier));
		expect(bySupplier).toEqual({ [UNCATEGORIZED_CATEGORY]: 175 });
		expect(Object.keys(byLine).sort()).toEqual(['Bebidas', 'Frutas y Verduras', UNCATEGORIZED_CATEGORY].sort());
	});

	it('the materialised view carries the same split as the live query', async () => {
		expect(await mvSpend(rid, MONTH)).toEqual(await spendByLineCategory(rid, MONTH));
	});

	it('the spend trend stacks the same segments', async () => {
		const data = await getTrendDataByRange(rid, 'all', 'monthly');
		const segments = data.buckets.flatMap((b) => b.segments);
		const byCategory: Spend = {};
		for (const s of segments) {
			const key = s.category ?? UNCATEGORIZED_CATEGORY;
			byCategory[key] = (byCategory[key] ?? 0) + s.amount;
		}
		expect(byCategory).toEqual(await spendByLineCategory(rid, MONTH));
	});
});

describeDb('category attribution — no regression for mono-category suppliers', () => {
	let rid: string;

	beforeAll(async () => {
		({ id: rid } = await createTestRestaurant('cat-attr-mono'));

		const produce = await makeSupplier(rid, 'Frutas Gómez', 'Frutas y Verduras');
		const drinks = await makeSupplier(rid, 'Bebidas Norte', 'Bebidas');
		const untagged = await makeSupplier(rid, 'Sin Clasificar', null);

		const tomate = await makeProduct(rid, 'Tomate pera', 'Frutas y Verduras');
		const cebolla = await makeProduct(rid, 'Cebolla', 'Frutas y Verduras');
		const agua = await makeProduct(rid, 'Agua mineral', 'Bebidas');

		await makeInvoice(rid, produce, 'M-1', [
			{ description: 'Tomate pera', productId: tomate, amount: 80 },
			{ description: 'Cebolla', productId: cebolla, amount: 20 },
		]);
		await makeInvoice(rid, drinks, 'M-2', [
			{ description: 'Agua mineral', productId: agua, amount: 60 },
		]);
		await makeInvoice(rid, untagged, 'M-3', [
			{ description: 'Servicio', productId: null, amount: 40 },
		]);
	});

	afterAll(async () => {
		await cleanupTestRestaurant(rid);
	});

	it('agrees with the supplier-level split to the cent', async () => {
		expect(await spendByLineCategory(rid, MONTH)).toEqual(await spendBySupplierCategory(rid, MONTH));
	});

	it('reconciles with the sum of invoice totals', async () => {
		const spend = await spendByLineCategory(rid, MONTH);
		const total = Object.values(spend).reduce((a, b) => a + b, 0);

		const [row] = await testDb.execute<{ total: string }>(sql`
			SELECT COALESCE(SUM(total_amount), 0) AS total
			FROM invoices
			WHERE restaurant_id = ${rid}
			  AND deleted_at IS NULL
			  AND TO_CHAR(invoice_date, 'YYYY-MM') = ${MONTH}
		`);
		expect(total).toBe(Number(row.total));
	});

	it('a nameless line is the one way the two totals can drift apart', async () => {
		const before = await spendByLineCategory(rid, MONTH);
		const [inv] = await testDb.insert(invoices)
			.values({
				restaurantId: rid, supplierId: await makeSupplier(rid, 'Nota Suelta', 'Bebidas'),
				invoiceNumber: 'M-4', invoiceDate: DAY, totalAmount: '15.00', status: 'pending',
			})
			.returning({ id: invoices.id });
		await testDb.insert(invoiceLineItems).values({
			restaurantId: rid, invoiceId: inv.id, description: '',
			quantity: 1, unit: 'ud', unitPrice: '15.00', totalPrice: '15.00',
		});

		const after = await spendByLineCategory(rid, MONTH);
		expect(after).toEqual(before);
	});
});

describeDb('category attribution — the shared criterion', () => {
	it('falls back to the canonical uncategorised bucket, not a stray literal', async () => {
		// The 'Other' inside lineCategoryExpr() is a SQL literal on purpose:
		// a bound parameter renders differently in SELECT and GROUP BY and
		// Postgres then rejects the statement. This is the guard that keeps
		// that literal and UNCATEGORIZED_CATEGORY from drifting apart.
		const rows = await testDb.execute<{ category: string }>(sql`
			SELECT ${lineCategoryExpr()} AS category
			FROM (SELECT NULL::text AS category) AS suppliers,
			     (SELECT NULL::text AS category) AS products
		`);
		expect(rows[0].category).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('prefers the product over the supplier tag', async () => {
		const rows = await testDb.execute<{ category: string }>(sql`
			SELECT ${lineCategoryExpr()} AS category
			FROM (SELECT 'Bebidas'::text AS category) AS suppliers,
			     (SELECT 'Frutas y Verduras'::text AS category) AS products
		`);
		expect(rows[0].category).toBe('Frutas y Verduras');
	});
});

describeDb('runBudgetCheck — one budget per category on the delivery note', () => {
	let rid: string;
	let supplierId: number;
	let invoiceId: number;
	const month = toMonthStr(new Date());
	const today = new Date().toISOString().slice(0, 10);

	beforeAll(async () => {
		({ id: rid } = await createTestRestaurant('cat-attr-budget'));
		supplierId = await makeSupplier(rid, 'Distribuciones Generales', UNCATEGORIZED_CATEGORY);
		const tomate = await makeProduct(rid, 'Tomate pera', 'Frutas y Verduras');
		const agua = await makeProduct(rid, 'Agua mineral', 'Bebidas');

		const [inv] = await testDb.insert(invoices)
			.values({
				restaurantId: rid, supplierId, invoiceNumber: 'B-1',
				invoiceDate: today, totalAmount: '180.00', status: 'pending',
			})
			.returning({ id: invoices.id });
		invoiceId = inv.id;
		await testDb.insert(invoiceLineItems).values([
			{ restaurantId: rid, invoiceId, productId: tomate, description: 'Tomate pera', quantity: 1, unit: 'ud', unitPrice: '120.00', totalPrice: '120.00' },
			{ restaurantId: rid, invoiceId, productId: agua, description: 'Agua mineral', quantity: 1, unit: 'ud', unitPrice: '50.00', totalPrice: '50.00' },
			{ restaurantId: rid, invoiceId, productId: null, description: 'Portes', quantity: 1, unit: 'ud', unitPrice: '10.00', totalPrice: '10.00' },
		]);

		await testDb.insert(categoryBudgets).values([
			{ restaurantId: rid, category: 'Frutas y Verduras', month, monthlyBudget: '100.00' },
			{ restaurantId: rid, category: 'Bebidas', month, monthlyBudget: '40.00' },
			{ restaurantId: rid, category: 'Congelados', month, monthlyBudget: '500.00' },
		]);
	});

	afterAll(async () => {
		await cleanupTestRestaurant(rid);
	});

	it('raises one alert per budgeted category the invoice actually touched', async () => {
		const alerts = await runBudgetCheck(invoiceId, supplierId, rid);
		const byCategory = Object.fromEntries(
			alerts.map((a) => [(a.payload as { category: string }).category, a.payload as Record<string, unknown>]),
		);

		expect(Object.keys(byCategory).sort()).toEqual(['Bebidas', 'Frutas y Verduras']);
		expect(byCategory['Frutas y Verduras']).toMatchObject({ spent: 120, budget: 100, level: 'exceeded' });
		expect(byCategory['Bebidas']).toMatchObject({ spent: 50, budget: 40, level: 'exceeded' });
	});

	it('leaves an untouched category\'s budget alone', async () => {
		const alerts = await runBudgetCheck(invoiceId, supplierId, rid);
		expect(alerts.map((a) => (a.payload as { category: string }).category)).not.toContain('Congelados');
	});
});
