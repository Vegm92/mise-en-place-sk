/**
 * Issue #905 task 3: supplier resolution is keyed on the normalised NIF/CIF
 * before the printed name, so one tax id carries several trade names instead
 * of spawning a duplicate supplier row per name variation.
 *
 * Everything here runs against the live test DB because the resolution order
 * lives in SQL (`supplier.ts`): the partial index on `(restaurant_id,
 * normalized_cif)`, the `supplier_aliases` unique index, and the existing
 * `ON CONFLICT (restaurant_id, lower(name))` upsert have to agree.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getOrCreateSupplierId } from '../src/lib/server/supplier';
import { suppliers, supplierAliases } from '../src/lib/server/schema';
import { UNCATEGORIZED_CATEGORY } from '../src/lib/constants';
import { testDb, testSql, createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './helpers/test-db';

afterAll(async () => {
	if (hasDbEnv) await closeDb();
});

const CAT = UNCATEGORIZED_CATEGORY;

async function withRestaurant(suffix: string, body: (rid: string) => Promise<void>): Promise<void> {
	const r = await createTestRestaurant(suffix);
	try {
		await body(r.id);
	} finally {
		await cleanupTestRestaurant(r.id);
	}
}

function rowsFor(rid: string) {
	return testDb.select().from(suppliers).where(eq(suppliers.restaurantId, rid));
}

function aliasesFor(rid: string) {
	return testDb.select().from(supplierAliases).where(eq(supplierAliases.restaurantId, rid));
}

describe.skipIf(!hasDbEnv)('#905 CIF-first supplier resolution', () => {
	it('resolves a second printed name to the supplier that already holds the tax id', () => withRestaurant('cif-match', async (rid) => {
		const first = await getOrCreateSupplierId(rid, 'ELABORADENTAL', testDb, CAT, { cif: 'B99999997' });
		const second = await getOrCreateSupplierId(
			rid, 'LUCIA MARIA FERNANDEZ SANCHEZ', testDb, CAT, { cif: 'B-99.999.997' },
		);
		expect(second).toBe(first);
		expect(await rowsFor(rid)).toHaveLength(1);
	}));

	it('matches across separators and the ES country prefix', () => withRestaurant('cif-normalize', async (rid) => {
		const first = await getOrCreateSupplierId(rid, 'Makro', testDb, CAT, { cif: 'b 99999997' });
		const second = await getOrCreateSupplierId(rid, 'Makro Cash', testDb, CAT, { cif: 'ESB99999997' });
		expect(second).toBe(first);
	}));

	it('keeps different tax ids on separate suppliers', () => withRestaurant('cif-distinct', async (rid) => {
		const a = await getOrCreateSupplierId(rid, 'Proveedor A', testDb, CAT, { cif: 'B99999997' });
		const b = await getOrCreateSupplierId(rid, 'Proveedor B', testDb, CAT, { cif: 'P12345674' });
		expect(b).not.toBe(a);
		expect(await rowsFor(rid)).toHaveLength(2);
	}));

	it('does not match on a tax id the caller marked untrusted', () => withRestaurant('cif-untrusted', async (rid) => {
		const first = await getOrCreateSupplierId(rid, 'Bodega Central', testDb, CAT, { cif: 'B99999997' });
		const second = await getOrCreateSupplierId(
			rid, 'Otro Proveedor', testDb, CAT, { cif: 'B99999997' }, false,
		);
		expect(second).not.toBe(first);
	}));

	it('backfills normalized_cif onto a supplier first created without one', () => withRestaurant('cif-backfill', async (rid) => {
		const id = await getOrCreateSupplierId(rid, 'Lácteos García', testDb);
		await getOrCreateSupplierId(rid, 'Lácteos García', testDb, CAT, { cif: 'ES B99999997' });
		const [row] = await rowsFor(rid);
		expect(row.id).toBe(id);
		expect(row.normalizedCif).toBe('B99999997');
	}));

	it('fills contact fields left empty on the supplier the tax id resolved to', () => withRestaurant('cif-contact', async (rid) => {
		await getOrCreateSupplierId(rid, 'Ferretería Pepe', testDb, CAT, { cif: 'B99999997' });
		await getOrCreateSupplierId(rid, 'Ferreteria Pepe Hermanos', testDb, CAT, {
			cif: 'B99999997', email: 'pedidos@pepe.es', phone: '900112233', address: 'Calle Mayor 1',
		});
		const [row] = await rowsFor(rid);
		expect(row.contactEmail).toBe('pedidos@pepe.es');
		expect(row.contactPhone).toBe('900112233');
		expect(row.address).toBe('Calle Mayor 1');
	}));
});

describe.skipIf(!hasDbEnv)('#905 alias capture', () => {
	it('records the differing printed name as an alias of the matched supplier', () => withRestaurant('alias-capture', async (rid) => {
		const id = await getOrCreateSupplierId(rid, 'ELABORADENTAL', testDb, CAT, { cif: 'B99999997' });
		await getOrCreateSupplierId(rid, 'Lucía María Fernández', testDb, CAT, { cif: 'B99999997' });
		const aliases = await aliasesFor(rid);
		expect(aliases).toHaveLength(1);
		expect(aliases[0].supplierId).toBe(id);
		expect(aliases[0].name).toBe('Lucía María Fernández');
		expect(aliases[0].normalizedName).toBe('lucia maria fernandez');
	}));

	it('does not record an alias when the name only differs by legal form or case', () => withRestaurant('alias-same-name', async (rid) => {
		await getOrCreateSupplierId(rid, 'Distribuciones Sur', testDb, CAT, { cif: 'B99999997' });
		await getOrCreateSupplierId(rid, 'distribuciones sur, S.L.', testDb, CAT, { cif: 'B99999997' });
		expect(await aliasesFor(rid)).toHaveLength(0);
	}));

	it('resolves a later invoice that prints only the alias and no tax id', () => withRestaurant('alias-lookup', async (rid) => {
		const id = await getOrCreateSupplierId(rid, 'ELABORADENTAL', testDb, CAT, { cif: 'B99999997' });
		await getOrCreateSupplierId(rid, 'Lucía María Fernández', testDb, CAT, { cif: 'B99999997' });
		const again = await getOrCreateSupplierId(rid, 'LUCIA MARIA FERNANDEZ', testDb);
		expect(again).toBe(id);
		expect(await rowsFor(rid)).toHaveLength(1);
	}));

	it('prefers an existing supplier name over an alias that normalises the same', () => withRestaurant('alias-name-wins', async (rid) => {
		const owner = await getOrCreateSupplierId(rid, 'ELABORADENTAL', testDb, CAT, { cif: 'B99999997' });
		await getOrCreateSupplierId(rid, 'Casa Pepe', testDb, CAT, { cif: 'B99999997' });
		await testSql`INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, 'Casa Pepe')`;
		const resolved = await getOrCreateSupplierId(rid, 'Casa Pepe', testDb);
		expect(resolved).not.toBe(owner);
	}));

	it('drops alias rows with the supplier they point at', () => withRestaurant('alias-cascade', async (rid) => {
		const id = await getOrCreateSupplierId(rid, 'Almacenes Vega', testDb, CAT, { cif: 'B99999997' });
		await getOrCreateSupplierId(rid, 'Vega Distribución', testDb, CAT, { cif: 'B99999997' });
		await testDb.delete(suppliers).where(eq(suppliers.id, id));
		expect(await aliasesFor(rid)).toHaveLength(0);
	}));
});
