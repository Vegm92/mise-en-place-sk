import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { BatchDb } from './batch-core';
import * as schema from './schema';
import { normalizeProductKey, canonicalizeUnit } from './normalize';
import { expandAbbreviations } from './product-dictionary';

type Database = PostgresJsDatabase<typeof schema>;

export const FUZZY_THRESHOLD = 0.42;

export interface ResolvedLine {
	productId: number;
	status: 'exact' | 'fuzzy' | 'created';
	suggestion?: { candidateName: string; score: number };
}

interface LineInput {
	description: string;
	unit?: string | null;
	category?: string | null;
}

export async function resolveLineProducts(
	tx: BatchDb,
	restaurantId: string,
	supplierId: number | null,
	lines: LineInput[],
): Promise<Map<string, ResolvedLine>> {
	const out = new Map<string, ResolvedLine>();

	const byKey = new Map<string, { raw: string; key: string; unit: string | null; category: string | null }>();
	for (const line of lines) {
		const raw = (line.description ?? '').trim();
		const key = normalizeProductKey(raw);
		if (!key) continue;
		if (!byKey.has(key)) {
			byKey.set(key, {
				raw,
				key,
				unit: canonicalizeUnit(line.unit) ?? (line.unit?.trim() || null),
				category: line.category ?? null,
			});
		}
	}
	if (byKey.size === 0) return out;

	for (const { raw, key, unit, category } of byKey.values()) {
		const resolved = await resolveOne(tx, restaurantId, supplierId, raw, key, unit, category);
		for (const line of lines) {
			if (normalizeProductKey((line.description ?? '').trim()) === key) {
				out.set(line.description ?? '', resolved);
			}
		}
	}
	return out;
}

async function resolveOne(
	tx: BatchDb,
	restaurantId: string,
	supplierId: number | null,
	raw: string,
	key: string,
	unit: string | null,
	category: string | null,
): Promise<ResolvedLine> {
	const aliasRows = await tx.execute<{ product_id: number }>(sql`
		SELECT product_id FROM product_aliases
		WHERE restaurant_id = ${restaurantId} AND raw_key = ${key}
		LIMIT 1
	`);
	if (aliasRows.length > 0) {
		return { productId: aliasRows[0].product_id, status: 'exact' };
	}

	const expandedKey = normalizeProductKey(expandAbbreviations(raw));
	const altKey = expandedKey && expandedKey !== key ? expandedKey : key;
	const fuzzyRows = await tx.execute<{ id: number; canonical_name: string; score: number }>(sql`
		SELECT id, canonical_name,
		       GREATEST(similarity(name_key, ${key}), similarity(name_key, ${altKey})) AS score
		FROM products
		WHERE restaurant_id = ${restaurantId}
		  AND GREATEST(similarity(name_key, ${key}), similarity(name_key, ${altKey})) >= ${FUZZY_THRESHOLD}
		ORDER BY score DESC
		LIMIT 1
	`);
	if (fuzzyRows.length > 0) {
		const candidate = fuzzyRows[0];
		await insertAlias(tx, restaurantId, candidate.id, supplierId, key, raw, 'fuzzy', null);
		return {
			productId: candidate.id,
			status: 'fuzzy',
			suggestion: { candidateName: candidate.canonical_name, score: Number(candidate.score) },
		};
	}

	const productRows = await tx.execute<{ id: number }>(sql`
		INSERT INTO products (restaurant_id, canonical_name, name_key, category, canonical_unit)
		VALUES (${restaurantId}, ${raw}, ${key}, ${category}, ${unit})
		ON CONFLICT (restaurant_id, name_key) DO UPDATE SET name_key = products.name_key
		RETURNING id
	`);
	const productId = productRows[0].id;
	await insertAlias(tx, restaurantId, productId, supplierId, key, raw, 'exact', 'now()');
	return { productId, status: 'created' };
}

async function insertAlias(
	tx: BatchDb,
	restaurantId: string,
	productId: number,
	supplierId: number | null,
	rawKey: string,
	rawText: string,
	source: 'exact' | 'fuzzy',
	confirmedAt: 'now()' | null,
): Promise<void> {
	const confirmedExpr = confirmedAt === 'now()' ? sql`now()` : sql`NULL`;
	await tx.execute(sql`
		INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key, raw_text, source, confirmed_at)
		VALUES (${restaurantId}, ${productId}, ${supplierId}, ${rawKey}, ${rawText}, ${source}, ${confirmedExpr})
		ON CONFLICT (restaurant_id, raw_key) DO NOTHING
	`);
}

export type AliasDecision =
	| { ok: true; productId: number }
	| { ok: false; reason: 'not_found' };

export interface LinkedSupplier {
	supplierId: number;
	supplierName: string;
}

export async function getLinkedSuppliers(
	database: Database,
	restaurantId: string,
	productId: number,
): Promise<LinkedSupplier[]> {
	const rows = await database.execute<{ supplier_id: number; supplier_name: string }>(sql`
		SELECT DISTINCT s.id AS supplier_id, s.name AS supplier_name
		FROM product_aliases a
		JOIN suppliers s ON s.id = a.supplier_id
		WHERE a.restaurant_id = ${restaurantId} AND a.product_id = ${productId} AND a.supplier_id IS NOT NULL
		ORDER BY s.name
	`);
	return rows.map((r) => ({ supplierId: r.supplier_id, supplierName: r.supplier_name }));
}

export async function unlinkSupplier(
	database: Database,
	restaurantId: string,
	productId: number,
	supplierId: number,
): Promise<void> {
	await database.transaction(async (tx) => {
		await tx.execute(sql`
			UPDATE invoice_line_items
			SET product_id = NULL
			WHERE restaurant_id = ${restaurantId}
			  AND product_id = ${productId}
			  AND invoice_id IN (
			    SELECT id FROM invoices WHERE restaurant_id = ${restaurantId} AND supplier_id = ${supplierId}
			  )
		`);
		await tx.execute(sql`
			DELETE FROM product_aliases
			WHERE restaurant_id = ${restaurantId} AND product_id = ${productId} AND supplier_id = ${supplierId}
		`);
	});
}

export type DeleteProductResult =
	| { ok: true }
	| { ok: false; reason: 'linked'; suppliers: LinkedSupplier[] }
	| { ok: false; reason: 'not_found' };

export async function deleteProduct(
	database: Database,
	restaurantId: string,
	productId: number,
): Promise<DeleteProductResult> {
	const existing = await database.execute<{ id: number }>(sql`
		SELECT id FROM products WHERE id = ${productId} AND restaurant_id = ${restaurantId} LIMIT 1
	`);
	if (existing.length === 0) return { ok: false, reason: 'not_found' };

	const linkedLineItems = await database.execute<{ count: number }>(sql`
		SELECT count(*)::int AS count FROM invoice_line_items
		WHERE restaurant_id = ${restaurantId} AND product_id = ${productId}
	`);
	const linkedAliases = await database.execute<{ count: number }>(sql`
		SELECT count(*)::int AS count FROM product_aliases
		WHERE restaurant_id = ${restaurantId} AND product_id = ${productId}
	`);
	if (linkedLineItems[0].count > 0 || linkedAliases[0].count > 0) {
		return { ok: false, reason: 'linked', suppliers: await getLinkedSuppliers(database, restaurantId, productId) };
	}

	await database.execute(sql`
		DELETE FROM products WHERE id = ${productId} AND restaurant_id = ${restaurantId}
	`);
	return { ok: true };
}

export async function resolveUnitConversionAlerts(
	database: Database,
	restaurantId: string,
	productId: number,
): Promise<void> {
	await database.execute(sql`
		UPDATE system_notifications
		SET status = 'sent'
		WHERE restaurant_id = ${restaurantId}
		  AND notification_type = 'unit_conversion_needed'
		  AND status = 'pending'
		  AND mep_norm_key(payload::json->>'ingredient') IN (
		    SELECT raw_key FROM product_aliases WHERE restaurant_id = ${restaurantId} AND product_id = ${productId}
		    UNION
		    SELECT name_key FROM products WHERE id = ${productId} AND restaurant_id = ${restaurantId}
		  )
	`);
}

export async function confirmProductAlias(
	database: Database,
	restaurantId: string,
	description: string,
): Promise<AliasDecision> {
	const rawKey = normalizeProductKey(description);
	const rows = await database.execute<{ product_id: number }>(sql`
		UPDATE product_aliases
		SET source = 'user', confirmed_at = COALESCE(confirmed_at, now())
		WHERE restaurant_id = ${restaurantId} AND raw_key = ${rawKey}
		RETURNING product_id
	`);
	if (rows.length === 0) return { ok: false, reason: 'not_found' };
	return { ok: true, productId: rows[0].product_id };
}

export async function rejectProductAlias(
	database: Database,
	restaurantId: string,
	description: string,
): Promise<AliasDecision> {
	const rawKey = normalizeProductKey(description);
	return database.transaction(async (tx) => {
		const aliasRows = await tx.execute<{ id: number; product_id: number; raw_text: string | null }>(sql`
			SELECT id, product_id, raw_text FROM product_aliases
			WHERE restaurant_id = ${restaurantId} AND raw_key = ${rawKey}
			LIMIT 1
		`);
		if (aliasRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;
		const alias = aliasRows[0];

		const created = await tx.execute<{ id: number }>(sql`
			INSERT INTO products (restaurant_id, canonical_name, name_key)
			VALUES (${restaurantId}, ${alias.raw_text ?? description.trim()}, ${rawKey})
			ON CONFLICT (restaurant_id, name_key) DO UPDATE SET name_key = products.name_key
			RETURNING id
		`);
		const newProductId = created[0].id;

		await tx.execute(sql`
			UPDATE product_aliases
			SET product_id = ${newProductId}, source = 'user', confirmed_at = now()
			WHERE id = ${alias.id}
		`);

		await tx.execute(sql`
			UPDATE invoice_line_items
			SET product_id = ${newProductId}
			WHERE restaurant_id = ${restaurantId}
			  AND product_id = ${alias.product_id}
			  AND mep_norm_key(description) = ${rawKey}
		`);

		return { ok: true, productId: newProductId } as AliasDecision;
	});
}

export async function mergeIntoProduct(
	database: Database,
	restaurantId: string,
	description: string,
	targetProductId: number,
): Promise<AliasDecision> {
	const rawKey = normalizeProductKey(description);
	return database.transaction(async (tx) => {
		const targetRows = await tx.execute<{ id: number }>(sql`
			SELECT id FROM products WHERE id = ${targetProductId} AND restaurant_id = ${restaurantId} LIMIT 1
		`);
		if (targetRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;

		const aliasRows = await tx.execute<{ id: number; product_id: number }>(sql`
			SELECT id, product_id FROM product_aliases
			WHERE restaurant_id = ${restaurantId} AND raw_key = ${rawKey}
			LIMIT 1
		`);
		if (aliasRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;
		const alias = aliasRows[0];
		const oldProductId = alias.product_id;

		if (oldProductId !== targetProductId) {
			await tx.execute(sql`
				UPDATE product_aliases
				SET product_id = ${targetProductId}, source = 'user', confirmed_at = now()
				WHERE id = ${alias.id}
			`);
			await tx.execute(sql`
				UPDATE invoice_line_items
				SET product_id = ${targetProductId}
				WHERE restaurant_id = ${restaurantId}
				  AND product_id = ${oldProductId}
				  AND mep_norm_key(description) = ${rawKey}
			`);
			await tx.execute(sql`
				DELETE FROM products p
				WHERE p.id = ${oldProductId} AND p.restaurant_id = ${restaurantId}
				  AND NOT EXISTS (SELECT 1 FROM product_aliases a WHERE a.product_id = p.id)
				  AND NOT EXISTS (SELECT 1 FROM invoice_line_items li WHERE li.product_id = p.id)
			`);
		} else {
			await tx.execute(sql`
				UPDATE product_aliases SET source = 'user', confirmed_at = COALESCE(confirmed_at, now())
				WHERE id = ${alias.id}
			`);
		}

		return { ok: true, productId: targetProductId } as AliasDecision;
	});
}
