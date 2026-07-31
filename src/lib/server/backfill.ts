import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { resolveLineProducts } from './product-catalog';
import { parsePack, normalizedUnitPrice } from './pack-parser';

type Database = PostgresJsDatabase<typeof schema>;

export interface BackfillResult { packed: number; linked: number }

async function backfillPacks(database: Database, restaurantId: string): Promise<number> {
	const rows = await database.execute<{ id: number; description: string | null; unit: string | null; unit_price: number | null }>(sql`
		SELECT id, description, unit, unit_price
		FROM invoice_line_items
		WHERE restaurant_id = ${restaurantId}
		  AND base_unit IS NULL
		  AND description IS NOT NULL AND description <> ''
	`);
	let packed = 0;
	for (const r of rows) {
		const pack = parsePack(r.description, r.unit);
		if (!pack) continue;
		const norm = normalizedUnitPrice(r.unit_price, pack);
		await database.execute(sql`
			UPDATE invoice_line_items SET
				units_per_pack = ${pack.unitsPerPack},
				unit_size = ${pack.unitSize},
				size_unit = ${pack.sizeUnit},
				base_unit = ${pack.baseUnit},
				normalized_unit_price = ${norm}
			WHERE id = ${r.id}
		`);
		packed++;
	}
	return packed;
}

async function backfillProductLinks(database: Database, restaurantId: string): Promise<number> {
	const rows = await database.execute<{ supplier_id: number; description: string; unit: string | null }>(sql`
		SELECT DISTINCT s.id AS supplier_id, ili.description, ili.unit
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		JOIN suppliers s ON s.id = i.supplier_id
		WHERE i.restaurant_id = ${restaurantId}
		  AND ili.product_id IS NULL
		  AND ili.description IS NOT NULL AND ili.description <> ''
		  AND i.deleted_at IS NULL
	`);
	if (rows.length === 0) return 0;

	const bySupplier = new Map<number, Array<{ description: string; unit: string | null }>>();
	for (const r of rows) {
		const list = bySupplier.get(r.supplier_id) ?? [];
		list.push({ description: r.description, unit: r.unit });
		bySupplier.set(r.supplier_id, list);
	}

	let linked = 0;
	for (const [supplierId, lines] of bySupplier) {
		const resolved = await resolveLineProducts(database, restaurantId, supplierId, lines);
		for (const [desc, r] of resolved) {
			const res = await database.execute<{ id: number }>(sql`
				UPDATE invoice_line_items
				SET product_id = ${r.productId}
				WHERE restaurant_id = ${restaurantId}
				  AND product_id IS NULL
				  AND mep_norm_key(description) = mep_norm_key(${desc})
				  AND invoice_id IN (
				      SELECT id FROM invoices
				      WHERE restaurant_id = ${restaurantId} AND supplier_id = ${supplierId} AND deleted_at IS NULL
				  )
				RETURNING id
			`);
			linked += res.length;
		}
	}
	return linked;
}

export async function backfillRestaurant(database: Database, restaurantId: string): Promise<BackfillResult> {
	const packed = await backfillPacks(database, restaurantId);
	const linked = await backfillProductLinks(database, restaurantId);
	return { packed, linked };
}
