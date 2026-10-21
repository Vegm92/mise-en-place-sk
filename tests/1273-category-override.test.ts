/**
 * RULE-008: a line's category is, in order, the per-line override the user set,
 * the product's category, the supplier's category, else the "uncategorized"
 * sentinel (`Other`, shown as "No category"). Uncategorized money is surfaced —
 * a share on the monthly report and a to-do on the dashboard — not buried.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';

vi.mock('$lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testDb, testSql, createTestRestaurant, cleanupTestRestaurant, hasDbEnv } from './helpers/test-db';
import { lineCategoryExpr, lineProductJoin, setLineCategory, uncategorizedSummary } from '../src/lib/server/category-spend';
import { UNCATEGORIZED_CATEGORY } from '../src/lib/constants';
import { buildMonthly } from '../src/lib/server/reports/monthly';
import { buildWorklist, type TurnoInput } from '../src/lib/dashboard-turno';

const describeDb = hasDbEnv ? describe : describe.skip;
const MONTH = '2026-03';

let rid = '';
let otherRid = '';
const lines: Record<string, number> = {};

async function category(lineId: number): Promise<string> {
	const rows = await testDb.execute<{ category: string }>(sql`
		SELECT ${lineCategoryExpr()} AS category
		FROM invoice_line_items
		JOIN invoices i ON i.id = invoice_line_items.invoice_id
		JOIN suppliers ON suppliers.id = i.supplier_id
		${lineProductJoin()}
		WHERE invoice_line_items.id = ${lineId}`);
	return String(rows[0]!.category);
}

async function seedLine(tenant: string, key: string, opts: {
	supplierCategory: string | null; productCategory?: string | null; override?: string | null; amount: number;
}) {
	const [supplier] = await testSql`
		INSERT INTO suppliers (restaurant_id, name, category) VALUES (${tenant}, ${'S-' + key}, ${opts.supplierCategory}) RETURNING id`;
	const [invoice] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount)
		VALUES (${tenant}, ${supplier!.id}, ${'N-' + key}, ${MONTH + '-10'}, ${opts.amount}) RETURNING id`;
	let productId: number | null = null;
	if (opts.productCategory !== undefined) {
		const [product] = await testSql`
			INSERT INTO products (restaurant_id, canonical_name, name_key, category)
			VALUES (${tenant}, ${'P-' + key}, ${'p-' + key + '-' + tenant}, ${opts.productCategory}) RETURNING id`;
		productId = product!.id;
	}
	const [line] = await testSql`
		INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, total_price, product_id, category_override)
		VALUES (${tenant}, ${invoice!.id}, ${'line ' + key}, ${opts.amount}, ${productId}, ${opts.override ?? null}) RETURNING id`;
	lines[key] = line!.id;
}

describeDb('line category attribution (RULE-008)', () => {
	beforeAll(async () => {
		rid = (await createTestRestaurant('cat-override')).id;
		otherRid = (await createTestRestaurant('cat-override-other')).id;
		await seedLine(rid, 'productWins', { supplierCategory: 'Bebidas', productCategory: 'Lácteos', amount: 10 });
		await seedLine(rid, 'supplierFallback', { supplierCategory: 'Bebidas', amount: 20 });
		await seedLine(rid, 'nothing', { supplierCategory: null, amount: 30 });
		await seedLine(rid, 'overrideWins', { supplierCategory: 'Bebidas', productCategory: 'Lácteos', override: 'Congelados', amount: 40 });
		await seedLine(rid, 'blankOverride', { supplierCategory: 'Bebidas', override: '', amount: 5 });
		await seedLine(otherRid, 'foreign', { supplierCategory: null, amount: 999 });
	});

	afterAll(async () => {
		await cleanupTestRestaurant(rid);
		await cleanupTestRestaurant(otherRid);
	});

	it('uses the product category before the supplier category', async () => {
		expect(await category(lines.productWins!)).toBe('Lácteos');
	});

	it('falls back to the supplier category, then to the uncategorized sentinel', async () => {
		expect(await category(lines.supplierFallback!)).toBe('Bebidas');
		expect(await category(lines.nothing!)).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('lets a per-line override beat both product and supplier', async () => {
		expect(await category(lines.overrideWins!)).toBe('Congelados');
	});

	it('ignores a blank override', async () => {
		expect(await category(lines.blankOverride!)).toBe('Bebidas');
	});

	it('summarises the uncategorized share for the dashboard, per tenant', async () => {
		const summary = await uncategorizedSummary(rid, `${MONTH}-01`, `${MONTH}-31`);
		expect(summary).toEqual({ count: 1, amount: 30 });
	});

	it('setLineCategory writes the override and removes the line from the to-do', async () => {
		expect(await setLineCategory(rid, lines.nothing!, 'Carnes y Derivados')).toBe(true);
		expect(await category(lines.nothing!)).toBe('Carnes y Derivados');
		expect((await uncategorizedSummary(rid, `${MONTH}-01`, `${MONTH}-31`)).count).toBe(0);
		expect(await setLineCategory(rid, lines.nothing!, null)).toBe(true);
		expect(await category(lines.nothing!)).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('setLineCategory refuses a category the tenant does not have, and another tenant\'s line', async () => {
		expect(await setLineCategory(rid, lines.nothing!, 'Not a category')).toBe(false);
		expect(await setLineCategory(rid, lines.foreign!, 'Lácteos')).toBe(false);
		expect(await category(lines.foreign!)).toBe(UNCATEGORIZED_CATEGORY);
	});

	it('the monthly report shows the uncategorized share of spend', async () => {
		const doc = await buildMonthly(rid, MONTH, new Date(`${MONTH}-20T10:00:00Z`));
		const kpi = doc.kpis.find((k) => k.label === 'rep.kpi.uncategorized');
		expect(kpi).toBeDefined();
		expect(kpi!.value).toBe('28,6 %');
	});
});

describe('dashboard to-do for uncategorized lines', () => {
	const base: TurnoInput = {
		isCurrentMonth: true, daysElapsed: 10, daysInMonth: 30, monthSpend: 0, projectedEom: 0,
		totalBudget: 0, budgets: {}, categorySpend: {}, priceShocks: [],
		review: { count: 0, amount: 0, incidencias: 0 }, missing: [], uncategorized: [],
	};

	it('adds nothing when every line has a category', () => {
		expect(buildWorklist({ ...base, uncategorizedLines: { count: 0, amount: 0 } })).toEqual([]);
	});

	it('lists the uncategorized lines as a to-do that links to where they are categorized', () => {
		const items = buildWorklist({ ...base, uncategorizedLines: { count: 3, amount: 120 } });
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ kind: 'lines', eur: 120, titleVars: { n: 3 }, href: '/categorize' });
	});
});
