import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { unitConversions, invoiceLineItems, invoices, suppliers } from '$lib/server/schema';
import { sql, eq, and } from 'drizzle-orm';
import { checkRateLimit } from '$lib/server/rate-limiter';

/** POST /api/unit-conversions — save a new UoM rule and clear pending flags. */
export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
	if (!await checkRateLimit(getClientAddress(), 30)) throw error(429, 'Too many requests');
	const rid = locals.restaurantId!;
	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid JSON' }, { status: 422 });

	const { supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor, supplier_id } = body;

	if (!supplier_name || !ingredient || !purchase_unit || !canonical_unit || conversion_factor == null) {
		return json({ error: 'Missing required fields: supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor' }, { status: 422 });
	}

	const factor = parseFloat(conversion_factor);
	if (isNaN(factor) || factor <= 0) {
		return json({ error: 'conversion_factor must be a positive number' }, { status: 422 });
	}

	const sName       = supplier_name.trim();
	const sIngredient = ingredient.trim();
	const sPurchase   = purchase_unit.trim();
	const sCanonical  = canonical_unit.trim();
	const sSupplierId = supplier_id != null ? parseInt(String(supplier_id), 10) : null;
	const resolvedSupplierId = (sSupplierId != null && !isNaN(sSupplierId)) ? sSupplierId : null;

	await db.insert(unitConversions)
		.values({
			restaurantId:     rid,
			supplierId:       resolvedSupplierId,
			supplierName:     sName,
			ingredient:       sIngredient,
			purchaseUnit:     sPurchase,
			canonicalUnit:    sCanonical,
			conversionFactor: factor,
		})
		.onConflictDoUpdate({
			target: [unitConversions.restaurantId, unitConversions.supplierName, unitConversions.ingredient, unitConversions.purchaseUnit],
			set:    { canonicalUnit: sCanonical, conversionFactor: factor, supplierId: resolvedSupplierId },
		});

	// Clear pending flags — join by supplier_id when known, fall back to name join.
	if (resolvedSupplierId != null) {
		await db.execute(sql`
			UPDATE invoice_line_items
			SET requires_unit_conversion = 0,
			    canonical_unit = ${sCanonical}
			WHERE description = ${sIngredient}
			  AND unit = ${sPurchase}
			  AND requires_unit_conversion = 1
			  AND invoice_id IN (
			      SELECT id FROM invoices
			      WHERE supplier_id = ${resolvedSupplierId}
			        AND restaurant_id = ${rid}
			  )
		`);
	} else {
		await db.execute(sql`
			UPDATE invoice_line_items
			SET requires_unit_conversion = 0,
			    canonical_unit = ${sCanonical}
			WHERE description = ${sIngredient}
			  AND unit = ${sPurchase}
			  AND requires_unit_conversion = 1
			  AND invoice_id IN (
			      SELECT i.id FROM invoices i
			      JOIN suppliers s ON i.supplier_id = s.id
			      WHERE s.name = ${sName}
			        AND i.restaurant_id = ${rid}
			  )
		`);
	}

	return json({ ok: true, message: `Rule saved: 1 ${sPurchase} = ${factor} ${sCanonical}` });
};
