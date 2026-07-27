/**
 * Atomic supplier get-or-create (issue #238).
 *
 * Replaces the select-then-insert pattern that used to live in invoice-save,
 * the invoice edit action, and the WhatsApp bot. Backed by the
 * uq_suppliers_rid_name unique index on (restaurant_id, lower(name)), so two
 * concurrent saves of the same new supplier converge on one row instead of
 * racing to insert clones. The no-op DO UPDATE makes RETURNING yield the
 * existing row on conflict (a bare DO NOTHING returns nothing on conflict).
 */
import { sql } from 'drizzle-orm';
import { db } from './db';
import type { BatchDb } from './batch-core';
import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY } from '$lib/constants';

/**
 * Returns the id of the tenant's supplier with this name, creating it if
 * absent. Case-insensitive and whitespace-trimmed to match the unique index.
 * Pass a transaction as `exec` to run inside an enclosing save.
 */
export async function getOrCreateSupplierId(
	restaurantId: string,
	name: string,
	exec: BatchDb = db,
	category: string = UNCATEGORIZED_CATEGORY,
): Promise<number> {
	const trimmed = name.trim();
	// A category is only ever applied at creation. New suppliers default to the
	// 'Other' bucket (issue #307) instead of a null category — without this,
	// every product resolved against a newly-created supplier inherits a null
	// category too (product-catalog.ts reads it at creation time), and
	// Budgets/category analytics have nothing to group on for any tenant that
	// never manually curates supplier categories. Callers may pass a category
	// proposed by extraction (issue #315); it must already have been through
	// `resolveSupplierCategory`, so an unrecognised guess arrives here as the
	// bucket and still triggers the categorisation nudge.
	//
	// The no-op DO UPDATE on conflict leaves an *existing* supplier's category
	// untouched — a later invoice never overwrites what a human chose, and
	// never silently reclassifies a supplier behind their back.
	const resolved = VALID_CATEGORIES.includes(category) ? category : UNCATEGORIZED_CATEGORY;
	const rows = await exec.execute<{ id: number }>(sql`
		INSERT INTO suppliers (restaurant_id, name, category)
		VALUES (${restaurantId}, ${trimmed}, ${resolved})
		ON CONFLICT (restaurant_id, lower(name))
		DO UPDATE SET name = suppliers.name
		RETURNING id
	`);
	return rows[0].id;
}
