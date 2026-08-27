import { sql } from 'drizzle-orm';
import { db } from './db';
import type { BatchDb } from './batch-core';
import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY, deriveSupplierTypeAndTags } from '$lib/constants';

/**
 * Interpolating a bare JS array into drizzle's `sql` template flattens it
 * into a comma list (e.g. for `IN (...)`) instead of binding it as a single
 * array parameter — an empty array becomes literal `()`, invalid SQL next to
 * `::text[]`. Building the Postgres array-literal string ourselves sidesteps
 * that (see incidencia in SEGUIR_SESION.md: found via the untyped-supplier
 * test case, which is exactly the common empty-array path).
 */
function pgTextArrayLiteral(values: string[]): string {
	const escaped = values.map(v => v.replaceAll('"', String.raw`\"`));
	return '{' + escaped.map(v => `"${v}"`).join(',') + '}';
}

export interface SupplierContactInfo {
	cif?: string | null;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
}

export interface SupplierMatch {
	id: number;
	name: string;
}

/**
 * Looks up an existing supplier by CIF first (a CIF match wins even if the
 * name was typed/read differently — company name changes shouldn't split the
 * price history), falling back to an exact name match.
 */
export async function findSupplierMatch(
	restaurantId: string,
	name: string,
	cif: string | null | undefined,
	exec: BatchDb = db,
): Promise<SupplierMatch | null> {
	const trimmedCif = cif?.trim() || null;
	if (trimmedCif) {
		const byCif = await exec.execute<{ id: number; name: string }>(sql`
			SELECT id, name FROM suppliers
			WHERE restaurant_id = ${restaurantId} AND cif IS NOT NULL AND upper(cif) = upper(${trimmedCif})
			LIMIT 1
		`);
		if (byCif.length > 0) return byCif[0];
	}
	const trimmedName = name.trim();
	if (!trimmedName) return null;
	const byName = await exec.execute<{ id: number; name: string }>(sql`
		SELECT id, name FROM suppliers
		WHERE restaurant_id = ${restaurantId} AND lower(name) = lower(${trimmedName})
		LIMIT 1
	`);
	return byName[0] ?? null;
}

export async function getOrCreateSupplierId(
	restaurantId: string,
	name: string,
	exec: BatchDb = db,
	category: string = UNCATEGORIZED_CATEGORY,
	contact: SupplierContactInfo = {},
): Promise<number> {
	const trimmed = name.trim();
	const resolved = VALID_CATEGORIES.includes(category) ? category : UNCATEGORIZED_CATEGORY;
	const { type, tags } = deriveSupplierTypeAndTags(resolved);
	const cif = contact.cif?.trim() || null;
	const email = contact.email?.trim() || null;
	const phone = contact.phone?.trim() || null;
	const address = contact.address?.trim() || null;

	if (cif) {
		const byCif = await exec.execute<{ id: number }>(sql`
			SELECT id FROM suppliers
			WHERE restaurant_id = ${restaurantId} AND cif IS NOT NULL AND upper(cif) = upper(${cif})
			LIMIT 1
		`);
		if (byCif.length > 0) {
			await exec.execute(sql`
				UPDATE suppliers SET
					contact_email = COALESCE(contact_email, ${email}),
					contact_phone = COALESCE(contact_phone, ${phone}),
					address = COALESCE(address, ${address})
				WHERE id = ${byCif[0].id}
			`);
			return byCif[0].id;
		}
	}

	const rows = await exec.execute<{ id: number }>(sql`
		INSERT INTO suppliers (restaurant_id, name, category, type, tags, cif, contact_email, contact_phone, address)
		VALUES (${restaurantId}, ${trimmed}, ${resolved}, ${pgTextArrayLiteral(type)}::text[], ${pgTextArrayLiteral(tags)}::text[], ${cif}, ${email}, ${phone}, ${address})
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
