import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { defineUnitConversion } from '$lib/server/products';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';

export const POST: RequestHandler = async ({ request, locals }) => {
	const rid = locals.restaurantId!;
	if (!await rateLimitScoped({ scope: 'tenant', name: 'unit-conversions', max: 30 }, { restaurantId: rid })) {
		throw error(429, 'Too many requests');
	}
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

	const parsedSupplierId = supplier_id != null ? parseInt(String(supplier_id), 10) : null;

	const result = await defineUnitConversion(db, rid, {
		supplierId:       parsedSupplierId != null && !isNaN(parsedSupplierId) ? parsedSupplierId : null,
		supplierName:     String(supplier_name),
		ingredient:       String(ingredient),
		purchaseUnit:     String(purchase_unit),
		canonicalUnit:    String(canonical_unit),
		conversionFactor: factor,
	});

	if (!result.ok) {
		return json({ error: 'conversion_factor must be a positive number' }, { status: 422 });
	}

	const purchaseUnit = String(purchase_unit).trim();
	const canonicalUnit = String(canonical_unit).trim();
	return json({ ok: true, message: `Rule saved: 1 ${purchaseUnit} = ${factor} ${canonicalUnit}`, resolvedPrompts: result.resolvedPrompts });
};
