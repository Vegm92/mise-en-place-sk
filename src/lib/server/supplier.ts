import { sql } from 'drizzle-orm';
import { db } from './db';
import type { BatchDb } from './batch';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { resolveCategoryFor } from './categories';

export interface SupplierContactInfo {
	cif?: string | null;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
}

export async function getOrCreateSupplierId(
	restaurantId: string,
	name: string,
	exec: BatchDb = db,
	category: string = UNCATEGORIZED_CATEGORY,
	contact: SupplierContactInfo = {},
	contactTrusted: boolean = true,
): Promise<number> {
	const trimmed = name.trim();
	const resolved = await resolveCategoryFor(restaurantId, category, undefined, exec);
	const cif = contact.cif?.trim() || null;
	const email = contact.email?.trim() || null;
	const phone = contact.phone?.trim() || null;
	const address = contact.address?.trim() || null;
	const mergeCif = contactTrusted ? cif : null;
	const mergeEmail = contactTrusted ? email : null;
	const mergePhone = contactTrusted ? phone : null;
	const mergeAddress = contactTrusted ? address : null;
	const rows = await exec.execute<{ id: number }>(sql`
		INSERT INTO suppliers (restaurant_id, name, category, cif, contact_email, contact_phone, address)
		VALUES (${restaurantId}, ${trimmed}, ${resolved}, ${cif}, ${email}, ${phone}, ${address})
		ON CONFLICT (restaurant_id, lower(name))
		DO UPDATE SET
			name = suppliers.name,
			category = CASE WHEN suppliers.category IS NULL THEN EXCLUDED.category ELSE suppliers.category END,
			cif = COALESCE(suppliers.cif, ${mergeCif}),
			contact_email = COALESCE(suppliers.contact_email, ${mergeEmail}),
			contact_phone = COALESCE(suppliers.contact_phone, ${mergePhone}),
			address = COALESCE(suppliers.address, ${mergeAddress})
		RETURNING id
	`);
	return rows[0].id;
}
