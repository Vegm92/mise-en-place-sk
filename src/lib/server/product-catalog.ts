/**
 * Product catalog resolution (issue #298, Phase 2).
 *
 * Maps each invoice line's raw description to a per-tenant product, so
 * downstream features can group on a stable product_id instead of the exact
 * string a supplier happened to print.
 *
 * Resolution per unique normalized key (mep_norm_key / normalizeProductKey):
 *   1. Confirmed alias with the same raw_key      → link (status 'exact').
 *   2. pg_trgm-similar existing product ≥ FUZZY_THRESHOLD
 *                                                 → link + pending 'fuzzy'
 *                                                   alias (status 'fuzzy').
 *   3. Otherwise                                  → create product + confirmed
 *                                                   'exact' alias (status 'created').
 *
 * A line is therefore always linked to some product; the fuzzy case additionally
 * records a suggestion the review UI can confirm or reject. Runs inside the save
 * transaction so the products/aliases and the line_items.product_id commit
 * atomically with the invoice.
 */
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { BatchDb } from './batch-core';
import * as schema from './schema';
import { normalizeProductKey, canonicalizeUnit } from './normalize';
import { expandAbbreviations } from './product-dictionary';

type Database = PostgresJsDatabase<typeof schema>;

// Trigram similarity above which two product names are treated as "probably the
// same product, ask the user". 0.42 is deliberately conservative: high enough
// to avoid noise, low enough to catch abbreviations/typos like
// "tomate pera" vs "tomate pera roja". Tunable; keep in sync with tests.
export const FUZZY_THRESHOLD = 0.42;

export interface ResolvedLine {
	productId: number;
	status: 'exact' | 'fuzzy' | 'created';
	/** Present when status === 'fuzzy': the existing product we auto-linked to. */
	suggestion?: { candidateName: string; score: number };
}

interface LineInput {
	description: string;
	unit?: string | null;
	category?: string | null;
}

/**
 * Resolve a batch of lines to product ids. Returns a map keyed by the RAW
 * (untrimmed-but-as-passed) description string so callers can look results up
 * by the same value they passed in. Lines whose normalized key is empty are
 * skipped (absent from the map).
 */
export async function resolveLineProducts(
	tx: BatchDb,
	restaurantId: string,
	supplierId: number | null,
	lines: LineInput[],
): Promise<Map<string, ResolvedLine>> {
	const out = new Map<string, ResolvedLine>();

	// De-dup by normalized key so a repeated description resolves once; keep the
	// first raw spelling/unit/category seen for display + product creation.
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
		// Map every raw line spelling that shares this key to the result.
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
	// 1. Existing alias for this exact normalized key.
	const aliasRows = await tx.execute<{ product_id: number }>(sql`
		SELECT product_id FROM product_aliases
		WHERE restaurant_id = ${restaurantId} AND raw_key = ${key}
		LIMIT 1
	`);
	if (aliasRows.length > 0) {
		return { productId: aliasRows[0].product_id, status: 'exact' };
	}

	// 2. Fuzzy match against existing products' normalized names. Also try the
	// dictionary-expanded key (issue #300) so "TERN. AGUJA" / "REF.1042 Merluza"
	// meet "ternera aguja" / "merluza" without the LLM. GREATEST takes the better
	// of the raw and expanded similarity.
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

	// 3. New product + confirmed exact alias.
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

/**
 * Insert (or converge on) the alias for this raw_key. confirmedAt is either the
 * literal 'now()' (confirmed) or null (pending). ON CONFLICT keeps whichever
 * alias won a concurrent race and returns its product_id so callers stay
 * consistent.
 */
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

/**
 * Confirm a pending fuzzy suggestion: keep the auto-link and mark the alias
 * user-confirmed. `description` is the raw invoice text; its normalized key
 * locates the alias. Idempotent — confirming an already-confirmed alias is a
 * no-op that still reports the linked product.
 */
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

/**
 * Reject a pending fuzzy suggestion: split this description into its own
 * product and repoint any line items that were fuzzy-linked to the wrong one.
 */
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

		// Repoint the line items that were fuzzy-linked to the wrong product.
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

/**
 * Confirm an LLM merge suggestion (issue #300): this description really is the
 * existing product `targetProductId`. Repoints the alias and its line items to
 * the target and deletes the throwaway product the description first created if
 * nothing else references it. `targetProductId` must belong to the tenant.
 */
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
			// Drop the throwaway product if nothing points at it anymore.
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
