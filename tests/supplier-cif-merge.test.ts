/**
 * Issue #949 — drizzle/0074_supplier_cif_merge.sql collapses the duplicate
 * supplier rows that existed before #905 taught new documents to resolve by tax
 * id, then makes (restaurant_id, normalized_cif) unique so the invariant is
 * enforced rather than merely respected by the resolution order.
 *
 * `supplier_id` is referenced from six tables with three delete behaviours, so
 * the assertions below are as much about what the merge must NOT lose as about
 * what it moves. Runs the exact committed migration file, so an edit to the SQL
 * is caught here rather than only in production.
 *
 * The dry-run report lives in the same file on purpose: it seeds the same
 * duplicate rows, and running the migration globally while another file deletes
 * the restaurants it just picked up is a race, not a test.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { testDb, testSql, createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './helpers/test-db';
import { isValidSpanishTaxId } from '../src/lib/tax-id';
import { normalizeSupplierName } from '../src/lib/server/normalize';
import { reportSupplierMerges, formatSupplierMergeReport } from '../src/lib/server/supplier-merge-report';

const MIGRATION_SQL = readFileSync('drizzle/0074_supplier_cif_merge.sql', 'utf8');

const VALID_CIF = 'B12345674';
const OTHER_CIF = 'A58818501';
const JUNK_CIF = 'B12345670';

const indexSql = (unique: string) => `
	DROP INDEX IF EXISTS suppliers_rid_normalized_cif_idx;
	CREATE ${unique} INDEX suppliers_rid_normalized_cif_idx
		ON suppliers (restaurant_id, normalized_cif) WHERE normalized_cif IS NOT NULL;
`;

/**
 * Puts the index back the way 0067 left it, so a test can seed the duplicate
 * rows the migration exists to collapse — the unique index it ends with makes
 * them unrepresentable, and this file runs against a database `pnpm db:migrate`
 * (or an earlier test here) has already migrated.
 */
const undoCifIndexSwap = () => testSql.unsafe(indexSql(''));
const redoCifIndexSwap = () => testSql.unsafe(indexSql('UNIQUE'));

afterAll(async () => {
	if (!hasDbEnv) return;
	await redoCifIndexSwap();
	await closeDb();
});

async function addSupplier(rid: string, name: string, normalizedCif: string | null) {
	const [row] = await testSql`
		INSERT INTO suppliers (restaurant_id, name, cif, normalized_cif)
		VALUES (${rid}, ${name}, ${normalizedCif}, ${normalizedCif}) RETURNING id`;
	return row.id as number;
}

async function addInvoice(rid: string, supplierId: number, invoiceNumber: string | null) {
	const [row] = await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date)
		VALUES (${rid}, ${supplierId}, ${invoiceNumber}, '2026-07-01') RETURNING id`;
	return row.id as number;
}

async function supplierIds(rid: string) {
	const rows = await testSql`SELECT id FROM suppliers WHERE restaurant_id = ${rid} ORDER BY id`;
	return rows.map((r) => r.id as number);
}

async function supplierOf(invoiceId: number) {
	const [row] = await testSql`SELECT supplier_id FROM invoices WHERE id = ${invoiceId}`;
	return row.supplier_id as number;
}

async function cifsOf(supplierId: number) {
	const [row] = await testSql`SELECT cif, normalized_cif FROM suppliers WHERE id = ${supplierId}`;
	return row as { cif: string | null; normalized_cif: string | null } | undefined;
}

async function supplierShape(rid: string) {
	return testSql`
		SELECT s.id, s.normalized_cif, i.id AS invoice_id, i.supplier_id
		FROM suppliers s
		LEFT JOIN invoices i ON i.supplier_id = s.id
		WHERE s.restaurant_id = ${rid}
		ORDER BY s.id, i.id`;
}

async function groupFor(rid: string) {
	const report = await reportSupplierMerges(testDb);
	return report.groups.find((g) => g.restaurantId === rid);
}

function withRestaurants(suffixes: string[], body: (...rids: string[]) => Promise<void>) {
	return async () => {
		const created = await Promise.all(suffixes.map((suffix) => createTestRestaurant(suffix)));
		try {
			await body(...created.map((r) => r.id));
		} finally {
			for (const r of created) await cleanupTestRestaurant(r.id);
		}
	};
}

/** One restaurant holding two supplier rows under the same tax id — the shape the merge exists for. */
function withDuplicatePair(
	suffix: string,
	body: (ctx: { rid: string; winner: number; loser: number }) => Promise<void>,
	names: [string, string] = ['Winner', 'Loser'],
) {
	return withRestaurants([suffix], async (rid) => {
		const winner = await addSupplier(rid, names[0], VALID_CIF);
		const loser = await addSupplier(rid, names[1], VALID_CIF);
		await body({ rid, winner, loser });
	});
}

describe.skipIf(!hasDbEnv)('0074_supplier_cif_merge — TS ↔ SQL parity (issue #949)', () => {
	it('mep_valid_spanish_tax_id agrees with isValidSpanishTaxId', async () => {
		const GOLDEN = [
			'12345678Z', '00000000T', 'X1234567L', 'Y1234567X', 'Z1234567R',
			'B12345674', 'A58818501', 'P1234567D', 'Q2826004J', 'ES B12345674',
			'12345678A', 'B12345670', 'X1234567Z', 'FOO', '1234567', '',
		];
		await testSql.unsafe(MIGRATION_SQL);
		for (const id of GOLDEN) {
			const [row] = await testSql`SELECT mep_valid_spanish_tax_id(${id}) AS ok`;
			expect((row as { ok: boolean }).ok, `SQL vs TS for ${JSON.stringify(id)}`)
				.toBe(isValidSpanishTaxId(id));
		}
	});

	it('mep_supplier_norm_name agrees with normalizeSupplierName', async () => {
		const GOLDEN = [
			'Distribuciones Lopez S.L.', 'DISTRIBUCIONES LOPEZ SL', 'Frutas Pepe, S.A.',
			'Cárnicas Ñoño S.L.U.', 'Bodegas García SLNE', 'Cooperativa del Sur S.Coop.',
			'Panadería La Espiga C.B.', 'Aceites del Sur, S.A.U.', 'Pescados Mar S.C.P.',
			'Can Víctor', 'Clínica dental Víctor Granda', 'Jamones D.O. S.A.', 'Café  Central  ',
		];
		await testSql.unsafe(MIGRATION_SQL);
		for (const name of GOLDEN) {
			const [row] = await testSql`SELECT mep_supplier_norm_name(${name}) AS key`;
			expect((row as { key: string }).key, `SQL vs TS for ${JSON.stringify(name)}`)
				.toBe(normalizeSupplierName(name));
		}
	});
});

describe.skipIf(!hasDbEnv)('0074_supplier_cif_merge — merge (issue #949)', () => {
	beforeEach(undoCifIndexSwap);

	it('collapses a group onto its lowest id, moving every invoice and keeping the old names resolvable',
		withDuplicatePair('cifmerge-collapse', async ({ rid, winner, loser }) => {
			const third = await addSupplier(rid, 'Clínica dental Víctor Granda S.L.', VALID_CIF);
			const fromLoser = await addInvoice(rid, loser, 'A-1');
			const fromThird = await addInvoice(rid, third, 'B-1');

			await testSql.unsafe(MIGRATION_SQL);

			expect(await supplierIds(rid)).toEqual([winner]);
			expect(await supplierOf(fromLoser)).toBe(winner);
			expect(await supplierOf(fromThird)).toBe(winner);

			const aliases = await testSql`
				SELECT normalized_name, supplier_id FROM supplier_aliases WHERE restaurant_id = ${rid}`;
			expect(aliases.every((a) => a.supplier_id === winner)).toBe(true);
			expect(aliases.map((a) => a.normalized_name as string).sort()).toEqual(
				[normalizeSupplierName('Clínica dental Víctor Granda S.L.'), normalizeSupplierName('Víctor Granda')].sort(),
			);
		}, ['Can Víctor', 'Víctor Granda']));

	it('repoints the aliases, product aliases, unit conversions and corrections a loser owned',
		withDuplicatePair('cifmerge-children', async ({ rid, winner, loser }) => {
			const [product] = await testSql`
				INSERT INTO products (restaurant_id, canonical_name, name_key)
				VALUES (${rid}, 'Tomate pera', 'tomate pera') RETURNING id`;
			const [alias] = await testSql`
				INSERT INTO supplier_aliases (restaurant_id, supplier_id, name, normalized_name)
				VALUES (${rid}, ${loser}, 'Loser Antiguo', 'loser antiguo') RETURNING id`;
			const [productAlias] = await testSql`
				INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key)
				VALUES (${rid}, ${product.id}, ${loser}, 'tomate pera 5kg') RETURNING id`;
			const [conversion] = await testSql`
				INSERT INTO unit_conversions (restaurant_id, supplier_id, supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor)
				VALUES (${rid}, ${loser}, 'Loser', 'tomate', 'caja', 'kg', 5) RETURNING id`;
			const [correction] = await testSql`
				INSERT INTO extraction_corrections (restaurant_id, supplier_id, field_name)
				VALUES (${rid}, ${loser}, 'supplier_name') RETURNING id`;

			await testSql.unsafe(MIGRATION_SQL);

			const moved = await testSql`
				SELECT supplier_id FROM supplier_aliases WHERE id = ${alias.id}
				UNION ALL SELECT supplier_id FROM product_aliases WHERE id = ${productAlias.id}
				UNION ALL SELECT supplier_id FROM unit_conversions WHERE id = ${conversion.id}
				UNION ALL SELECT supplier_id FROM extraction_corrections WHERE id = ${correction.id}`;
			expect(moved.map((row) => row.supplier_id)).toEqual([winner, winner, winner, winner]);
		}));

	it('drops both cached reliability rows so the score is recomputed over the merged invoices',
		withDuplicatePair('cifmerge-metrics', async ({ rid, winner, loser }) => {
			await testSql`
				INSERT INTO supplier_metrics (restaurant_id, supplier_id, score) VALUES
				(${rid}, ${winner}, 40), (${rid}, ${loser}, 90)`;

			await testSql.unsafe(MIGRATION_SQL);

			const rows = await testSql`SELECT supplier_id FROM supplier_metrics WHERE restaurant_id = ${rid}`;
			expect(rows).toHaveLength(0);
		}));

	it('keeps an invoice whose number the winner already uses, and takes the tax id off the row it stays on',
		withDuplicatePair('cifmerge-collision', async ({ rid, winner, loser }) => {
			await addInvoice(rid, winner, 'F-1');
			const clashing = await addInvoice(rid, loser, 'F-1');
			const movable = await addInvoice(rid, loser, 'F-2');

			await testSql.unsafe(MIGRATION_SQL);

			expect(await supplierOf(clashing)).toBe(loser);
			expect(await supplierOf(movable)).toBe(winner);
			expect(await supplierIds(rid)).toEqual([winner, loser]);
			expect(await cifsOf(loser)).toEqual({ cif: VALID_CIF, normalized_cif: null });
			expect((await cifsOf(winner))?.normalized_cif).toBe(VALID_CIF);
		}));

	it('clears a tax id that fails the checksum instead of merging on it, keeping the printed value',
		withRestaurants(['cifmerge-junk'], async (rid) => {
			const first = await addSupplier(rid, 'Junk One', JUNK_CIF);
			const second = await addSupplier(rid, 'Junk Two', JUNK_CIF);

			await testSql.unsafe(MIGRATION_SQL);

			expect(await supplierIds(rid)).toEqual([first, second]);
			expect(await cifsOf(first)).toEqual({ cif: JUNK_CIF, normalized_cif: null });
			expect(await cifsOf(second)).toEqual({ cif: JUNK_CIF, normalized_cif: null });
		}));

	it('never merges across restaurants, and leaves distinct tax ids alone',
		withRestaurants(['cifmerge-mine', 'cifmerge-other'], async (mine, other) => {
			const minesSupplier = await addSupplier(mine, 'Shared Name', VALID_CIF);
			const othersSupplier = await addSupplier(other, 'Shared Name', VALID_CIF);
			const distinct = await addSupplier(mine, 'Distinct', OTHER_CIF);

			await testSql.unsafe(MIGRATION_SQL);

			expect(await supplierIds(mine)).toEqual([minesSupplier, distinct]);
			expect(await supplierIds(other)).toEqual([othersSupplier]);
			expect((await cifsOf(minesSupplier))?.normalized_cif).toBe(VALID_CIF);
			expect((await cifsOf(othersSupplier))?.normalized_cif).toBe(VALID_CIF);
		}));

	it('is idempotent — a second run changes nothing',
		withDuplicatePair('cifmerge-idempotent', async ({ rid, loser }) => {
			await addInvoice(rid, loser, 'A-1');

			await testSql.unsafe(MIGRATION_SQL);
			const afterFirstRun = await supplierShape(rid);
			await testSql.unsafe(MIGRATION_SQL);

			expect(await supplierShape(rid)).toEqual(afterFirstRun);
		}));

	it('leaves a second row with the same tax id impossible to insert afterwards',
		withRestaurants(['cifmerge-unique'], async (rid) => {
			await addSupplier(rid, 'Only One', VALID_CIF);

			await testSql.unsafe(MIGRATION_SQL);

			await expect(addSupplier(rid, 'Impostor', VALID_CIF)).rejects.toThrow(/suppliers_rid_normalized_cif_idx/);
		}));
});

describe.skipIf(!hasDbEnv)('reportSupplierMerges (issue #949)', () => {
	beforeEach(undoCifIndexSwap);

	it('names the row a group collapses into and counts the invoices that move',
		withDuplicatePair('mergereport-group', async ({ rid, winner, loser }) => {
			await addInvoice(rid, winner, 'W-1');
			await addInvoice(rid, loser, 'L-1');
			await addInvoice(rid, loser, 'L-2');

			const group = await groupFor(rid);

			expect(group?.winner).toEqual({ id: winner, name: 'Can Víctor', invoiceCount: 1 });
			expect(group?.losers).toEqual([{ id: loser, name: 'Víctor Granda', invoiceCount: 2 }]);
			expect(group?.normalizedCif).toBe(VALID_CIF);
			expect(group?.invoicesMoving).toBe(2);
			expect(group?.invoicesBlocked).toBe(0);
		}, ['Can Víctor', 'Víctor Granda']));

	it('counts an invoice number the group already uses as blocked rather than moving',
		withDuplicatePair('mergereport-blocked', async ({ rid, winner, loser }) => {
			await addInvoice(rid, winner, 'F-1');
			await addInvoice(rid, loser, 'F-1');
			await addInvoice(rid, loser, 'F-2');

			const group = await groupFor(rid);

			expect(group?.invoicesMoving).toBe(1);
			expect(group?.invoicesBlocked).toBe(1);
		}));

	it('counts a tax id that fails the checksum as junk to clear, never as a group',
		withRestaurants(['mergereport-junk'], async (rid) => {
			await addSupplier(rid, 'Junk One', JUNK_CIF);
			await addSupplier(rid, 'Junk Two', JUNK_CIF);

			const report = await reportSupplierMerges(testDb);

			expect(report.groups.find((g) => g.restaurantId === rid)).toBeUndefined();
			expect(report.invalidTaxIds).toBeGreaterThanOrEqual(2);
		}));

	it('does not group two restaurants that share a tax id, and writes nothing',
		withRestaurants(['mergereport-mine', 'mergereport-other'], async (mine, other) => {
			await addSupplier(mine, 'Shared Name', VALID_CIF);
			await addSupplier(other, 'Shared Name', VALID_CIF);
			const untouched = await supplierShape(mine);

			expect(await groupFor(mine)).toBeUndefined();
			expect(await groupFor(other)).toBeUndefined();
			expect(await supplierShape(mine)).toEqual(untouched);
		}));

	it('formats a group as the winner it keeps and the rows it retires',
		withDuplicatePair('mergereport-format', async ({ rid, winner, loser }) => {
			const group = await groupFor(rid);

			const text = formatSupplierMergeReport({
				groups: group ? [group] : [],
				suppliersMerged: 1,
				invoicesMoving: 0,
				invoicesBlocked: 0,
				invalidTaxIds: 0,
			});

			expect(text).toContain(`keep #${winner} Can Víctor`);
			expect(text).toContain(`merge #${loser} Víctor Granda`);
		}, ['Can Víctor', 'Víctor Granda']));
});
