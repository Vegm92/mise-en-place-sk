import { sql } from 'drizzle-orm';
import { db } from './db';
import type { BatchDb } from './batch';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { normalizeTaxId, taxIdDecidesIdentity } from '$lib/tax-id';
import { resolveCategoryFor } from './categories';
import { isSameSupplierName, normalizeSupplierName } from './normalize';

export interface SupplierContactInfo {
	cif?: string | null;
	cifConfidence?: number | null;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
	iban?: string | null;
	paymentTerms?: string | null;
}

interface ContactMerge {
	cif: string | null;
	normalizedCif: string | null;
	email: string | null;
	phone: string | null;
	address: string | null;
	iban: string | null;
	paymentTerms: string | null;
}

async function mergeContactInto(
	exec: BatchDb,
	restaurantId: string,
	supplierId: number,
	merge: ContactMerge,
): Promise<void> {
	await exec.execute(sql`
		UPDATE suppliers SET
			cif = COALESCE(cif, ${merge.cif}),
			normalized_cif = COALESCE(normalized_cif, ${merge.normalizedCif}),
			contact_email = COALESCE(contact_email, ${merge.email}),
			contact_phone = COALESCE(contact_phone, ${merge.phone}),
			address = COALESCE(address, ${merge.address}),
			iban = COALESCE(iban, ${merge.iban}),
			payment_terms = COALESCE(payment_terms, ${merge.paymentTerms})
		WHERE id = ${supplierId} AND restaurant_id = ${restaurantId}
	`);
}

async function recordAlias(
	exec: BatchDb,
	restaurantId: string,
	supplierId: number,
	name: string,
): Promise<void> {
	const normalized = normalizeSupplierName(name);
	if (!normalized) return;
	await exec.execute(sql`
		INSERT INTO supplier_aliases (restaurant_id, supplier_id, name, normalized_name)
		VALUES (${restaurantId}, ${supplierId}, ${name}, ${normalized})
		ON CONFLICT (restaurant_id, normalized_name) DO NOTHING
	`);
}

async function findByTaxId(
	exec: BatchDb,
	restaurantId: string,
	normalizedCif: string,
): Promise<{ id: number; name: string } | null> {
	await exec.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}), hashtext(${normalizedCif}))`);
	const rows = await exec.execute<{ id: number; name: string }>(sql`
		SELECT id, name FROM suppliers
		WHERE restaurant_id = ${restaurantId} AND normalized_cif = ${normalizedCif}
		ORDER BY id
		LIMIT 1
	`);
	return rows[0] ?? null;
}

async function findByAlias(
	exec: BatchDb,
	restaurantId: string,
	name: string,
): Promise<number | null> {
	const normalized = normalizeSupplierName(name);
	if (!normalized) return null;
	const rows = await exec.execute<{ supplier_id: number }>(sql`
		SELECT a.supplier_id FROM supplier_aliases a
		WHERE a.restaurant_id = ${restaurantId}
			AND a.normalized_name = ${normalized}
			AND NOT EXISTS (
				SELECT 1 FROM suppliers s
				WHERE s.restaurant_id = ${restaurantId} AND lower(s.name) = lower(${name})
			)
		ORDER BY a.supplier_id
		LIMIT 1
	`);
	return rows[0]?.supplier_id ?? null;
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
	const iban = contact.iban?.trim() || null;
	const paymentTerms = contact.paymentTerms?.trim() || null;
	const normalizedCif = normalizeTaxId(cif);
	const merge: ContactMerge = {
		cif: contactTrusted ? cif : null,
		normalizedCif: contactTrusted ? normalizedCif : null,
		email: contactTrusted ? email : null,
		phone: contactTrusted ? phone : null,
		address: contactTrusted ? address : null,
		iban: contactTrusted ? iban : null,
		paymentTerms: contactTrusted ? paymentTerms : null,
	};

	if (contactTrusted && normalizedCif && taxIdDecidesIdentity(normalizedCif, contact.cifConfidence)) {
		const byTaxId = await findByTaxId(exec, restaurantId, normalizedCif);
		if (byTaxId) {
			await mergeContactInto(exec, restaurantId, byTaxId.id, merge);
			if (!isSameSupplierName(byTaxId.name, trimmed)) {
				await recordAlias(exec, restaurantId, byTaxId.id, trimmed);
			}
			return byTaxId.id;
		}
	}

	const byAlias = await findByAlias(exec, restaurantId, trimmed);
	if (byAlias !== null) {
		await mergeContactInto(exec, restaurantId, byAlias, merge);
		return byAlias;
	}

	const rows = await exec.execute<{ id: number }>(sql`
		INSERT INTO suppliers (restaurant_id, name, category, cif, normalized_cif, contact_email, contact_phone, address, iban, payment_terms)
		VALUES (${restaurantId}, ${trimmed}, ${resolved}, ${cif}, ${normalizedCif}, ${email}, ${phone}, ${address}, ${iban}, ${paymentTerms})
		ON CONFLICT (restaurant_id, lower(name))
		DO UPDATE SET
			name = suppliers.name,
			category = CASE WHEN suppliers.category IS NULL THEN EXCLUDED.category ELSE suppliers.category END,
			cif = COALESCE(suppliers.cif, ${merge.cif}),
			normalized_cif = COALESCE(suppliers.normalized_cif, ${merge.normalizedCif}),
			contact_email = COALESCE(suppliers.contact_email, ${merge.email}),
			contact_phone = COALESCE(suppliers.contact_phone, ${merge.phone}),
			address = COALESCE(suppliers.address, ${merge.address}),
			iban = COALESCE(suppliers.iban, ${merge.iban}),
			payment_terms = COALESCE(suppliers.payment_terms, ${merge.paymentTerms})
		RETURNING id
	`);
	return rows[0].id;
}
