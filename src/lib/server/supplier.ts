import { sql } from 'drizzle-orm';
import { db } from './db';
import type { BatchDb } from './batch-core';
import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY } from '$lib/constants';

/**
 * Supplier-level contact fields lifted from an extracted invoice (CIF/NIF,
 * address, email, phone). Any of these may be null/undefined when the
 * source document doesn't print them — never fabricated.
 */
export interface SupplierContactInfo {
	cif?: string | null;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
}

/**
 * Creates a supplier or resolves an existing one by (restaurant, lower(name)).
 *
 * Contact fields are filled in with COALESCE rather than overwritten: an
 * existing non-null value (whether entered by the user or captured on an
 * earlier invoice) always wins over a new extraction, so this can never
 * clobber a manual edit or replace real data with a blank.
 */
export async function getOrCreateSupplierId(
	restaurantId: string,
	name: string,
	exec: BatchDb = db,
	category: string = UNCATEGORIZED_CATEGORY,
	contact: SupplierContactInfo = {},
): Promise<number> {
	const trimmed = name.trim();
	const resolved = VALID_CATEGORIES.includes(category) ? category : UNCATEGORIZED_CATEGORY;
	const cif = contact.cif?.trim() || null;
	const email = contact.email?.trim() || null;
	const phone = contact.phone?.trim() || null;
	const address = contact.address?.trim() || null;
	const rows = await exec.execute<{ id: number }>(sql`
		INSERT INTO suppliers (restaurant_id, name, category, cif, contact_email, contact_phone, address)
		VALUES (${restaurantId}, ${trimmed}, ${resolved}, ${cif}, ${email}, ${phone}, ${address})
		ON CONFLICT (restaurant_id, lower(name))
		DO UPDATE SET
			name = suppliers.name,
			cif = COALESCE(suppliers.cif, EXCLUDED.cif),
			contact_email = COALESCE(suppliers.contact_email, EXCLUDED.contact_email),
			contact_phone = COALESCE(suppliers.contact_phone, EXCLUDED.contact_phone),
			address = COALESCE(suppliers.address, EXCLUDED.address)
		RETURNING id
	`);
	return rows[0].id;
}
