/**
 * Analytics readers moved off the nightly materialized views onto live
 * queries (src/lib/server/analytics-live.ts). This suite runs OLD (the MV,
 * freshly refreshed) against NEW (live) for the same tenant:
 *
 *  - clean data: every row of every view matches to the cent;
 *  - drift data: the only deltas are the two rule fixes the PR documents
 *    (a line's category_override; a soft-deleted invoice in extraction stats);
 *  - staleness: a line written after the refresh shows up live, not in the MV;
 *  - isolation: one tenant's reads never carry another tenant's numbers.
 *
 * Skips without DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import {
	testDb, testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import {
	liveCategoryMonthlySpend, liveExtractionStats, livePriceSnapshots,
} from '../src/lib/server/analytics-live';

const describeDb = hasDbEnv ? describe : describe.skip;

const ALL_FROM = '2000-01';
const ALL_TO = '2100-12';

type Row = Record<string, unknown>;

async function refreshViews() {
	for (const mv of ['mv_category_monthly_spend', 'mv_price_snapshots', 'mv_extraction_stats']) {
		await testSql.unsafe(`REFRESH MATERIALIZED VIEW ${mv}`);
	}
}

const CAT_COLS = sql`category, month, total_spend, invoice_count`;
const PRICE_COLS = sql`supplier_id, supplier_name, item_key, description, unit, latest_date, latest_price, latest_normalized_price, base_unit, prev_price, prev_date, change_pct`;
const EXTRACT_COLS = sql`invoice_id, supplier_id, month, correction_count`;

async function pair(rid: string, cols: SQL, mv: string, live: SQL, order: SQL): Promise<{ old: Row[]; now: Row[] }> {
	const old = await testDb.execute<Row>(sql`SELECT ${cols} FROM ${sql.raw(mv)} WHERE restaurant_id = ${rid} ORDER BY ${order}`);
	const now = await testDb.execute<Row>(sql`SELECT ${cols} FROM (${live}) x ORDER BY ${order}`);
	return { old: [...old], now: [...now] };
}

const cats = (rid: string) => pair(rid, CAT_COLS, 'mv_category_monthly_spend', liveCategoryMonthlySpend(rid, ALL_FROM, ALL_TO), sql`category, month`);
const tenantItemKeys = (rid: string) => sql`SELECT mep_norm_key(description) FROM invoice_line_items WHERE restaurant_id = ${rid}`;
const prices = (rid: string) => pair(rid, PRICE_COLS, 'mv_price_snapshots', livePriceSnapshots(rid, tenantItemKeys(rid)), sql`supplier_id, item_key`);
const extraction = (rid: string) => pair(rid, EXTRACT_COLS, 'mv_extraction_stats', liveExtractionStats(rid), sql`invoice_id`);

interface Seeded { rid: string; fruit: number; inv: number[]; cebollaLine: number }

async function seed(suffix: string, itemPrefix = ''): Promise<Seeded> {
	const rid = (await createTestRestaurant(suffix)).id;
	const [fruit] = await testSql`INSERT INTO suppliers (restaurant_id, name, category) VALUES (${rid}, 'Frutas Gómez', 'Frutas y Verduras') RETURNING id`;
	const [whole] = await testSql`INSERT INTO suppliers (restaurant_id, name, category) VALUES (${rid}, 'Mayorista Total', NULL) RETURNING id`;
	const [chicken] = await testSql`INSERT INTO products (restaurant_id, canonical_name, name_key, category) VALUES (${rid}, 'Pollo entero', ${itemPrefix + 'pollo entero'}, 'Carnes') RETURNING id`;

	const inv: number[] = [];
	for (const [supplier, date, n] of [[fruit, '2026-03-05', 1], [whole, '2026-03-20', 2], [fruit, '2026-04-02', 3], [whole, null, 4]] as const) {
		const [row] = await testSql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
			VALUES (${rid}, ${supplier!.id}, ${'PAR-' + n}, ${date}, 100, 'paid') RETURNING id`;
		inv.push(Number(row!.id));
	}

	const line = async (invoiceId: number, description: string, qty: number, unitPrice: number | null, total: number | null, productId: number | null = null) => {
		const [row] = await testSql`
			INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, quantity, unit, unit_price, total_price, product_id)
			VALUES (${rid}, ${invoiceId}, ${description}, ${qty}, 'kg', ${unitPrice}, ${total}, ${productId}) RETURNING id`;
		return Number(row!.id);
	};
	await line(inv[0]!, `${itemPrefix}Tomate pera`, 10, 2, 20);
	const cebollaLine = await line(inv[0]!, `${itemPrefix}Cebolla`, 5, 1.2, null);
	await line(inv[0]!, '', 1, 7, 7);
	await line(inv[1]!, `${itemPrefix}Pollo entero`, 5, 6, 30, Number(chicken!.id));
	await line(inv[1]!, `${itemPrefix}Tomate Pera`, 10, 1.5, 15);
	await line(inv[2]!, `${itemPrefix}Tomate pera`, 10, 2.5, 25);
	await line(inv[2]!, `${itemPrefix}Cebolla`, 1, 0, 0);
	await line(inv[3]!, `${itemPrefix}Aceite`, 2, 4, 8);

	await testSql`
		INSERT INTO extraction_corrections (restaurant_id, invoice_id, supplier_id, field_name)
		VALUES (${rid}, ${inv[0]!}, ${fruit!.id}, 'total_amount'), (${rid}, ${inv[0]!}, ${fruit!.id}, 'invoice_date'),
		       (${rid}, ${inv[1]!}, ${whole!.id}, 'supplier_name')`;
	return { rid, fruit: Number(fruit!.id), inv, cebollaLine };
}

describeDb('analytics: MV (old) vs live (new) parity', () => {
	let clean: Seeded;
	let drift: Seeded;

	beforeAll(async () => {
		clean = await seed('parity-clean');
		drift = await seed('parity-drift');
		await testSql`UPDATE invoice_line_items SET category_override = 'Bebidas' WHERE id = ${drift.cebollaLine}`;
		await testSql`UPDATE invoices SET deleted_at = now() WHERE id = ${drift.inv[1]!}`;
		await refreshViews();
	});

	afterAll(async () => {
		await cleanupTestRestaurant(clean?.rid);
		await cleanupTestRestaurant(drift?.rid);
		await closeDb();
	});

	it('clean data: every view matches row for row', async () => {
		for (const read of [cats, prices, extraction]) {
			const { old, now } = await read(clean.rid);
			expect(old.length).toBeGreaterThan(0);
			expect(now).toEqual(old);
		}
	});

	it('drift: price snapshots still match (deleted invoices were already filtered)', async () => {
		const { old, now } = await prices(drift.rid);
		expect(now).toEqual(old);
	});

	it('drift: category spend differs only by the overridden line moving to its override category (RULE-008)', async () => {
		const { old, now } = await cats(drift.rid);
		const at = (rows: Row[], category: string) => rows.find((r) => r.category === category && r.month === '2026-03');
		expect(Number(at(old, 'Frutas y Verduras')!.total_spend)).toBe(26);
		expect(Number(at(now, 'Frutas y Verduras')!.total_spend)).toBe(20);
		expect(at(old, 'Bebidas')).toBeUndefined();
		expect(Number(at(now, 'Bebidas')!.total_spend)).toBe(6);
		const untouched = (rows: Row[]) => rows.filter((r) => !(r.month === '2026-03' && ['Frutas y Verduras', 'Bebidas'].includes(String(r.category))));
		expect(untouched(now)).toEqual(untouched(old));
		const sum = (rows: Row[]) => rows.reduce((s, r) => s + Number(r.total_spend), 0);
		expect(sum(now)).toBe(sum(old));
	});

	it('drift: extraction stats drop exactly the soft-deleted invoice', async () => {
		const { old, now } = await extraction(drift.rid);
		expect(old.map((r) => Number(r.invoice_id))).toContain(drift.inv[1]);
		expect(now).toEqual(old.filter((r) => Number(r.invoice_id) !== drift.inv[1]));
	});

	it('a line written after the nightly refresh shows up live, not in the MV', async () => {
		await testSql`
			INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, quantity, unit, unit_price, total_price)
			VALUES (${clean.rid}, ${clean.inv[2]!}, 'Lechuga', 3, 'ud', 1, 3)`;
		const april = (rows: Row[]) => Number(rows.find((r) => r.category === 'Frutas y Verduras' && r.month === '2026-04')!.total_spend);
		const { old, now } = await cats(clean.rid);
		expect(april(old)).toBe(25);
		expect(april(now)).toBe(28);
	});
});
