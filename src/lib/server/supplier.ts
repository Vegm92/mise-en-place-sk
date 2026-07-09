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

/**
 * Returns the id of the tenant's supplier with this name, creating it if
 * absent. Case-insensitive and whitespace-trimmed to match the unique index.
 * Pass a transaction as `exec` to run inside an enclosing save.
 */
export async function getOrCreateSupplierId(
	restaurantId: string,
	name: string,
	exec: BatchDb = db,
): Promise<number> {
	const trimmed = name.trim();
	const rows = await exec.execute<{ id: number }>(sql`
		INSERT INTO suppliers (restaurant_id, name)
		VALUES (${restaurantId}, ${trimmed})
		ON CONFLICT (restaurant_id, lower(name))
		DO UPDATE SET name = suppliers.name
		RETURNING id
	`);
	return rows[0].id;
}
