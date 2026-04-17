import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { unitConversions, invoiceLineItems, invoices, suppliers } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
import { dbClient } from '$lib/server/db';

/** POST /api/unit-conversions — save a new UoM rule and clear pending flags. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid JSON' }, { status: 422 });

	const { supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor } = body;

	if (!supplier_name || !ingredient || !purchase_unit || !canonical_unit || conversion_factor == null) {
		return json({ error: 'Missing required fields: supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor' }, { status: 422 });
	}

	const factor = parseFloat(conversion_factor);
	if (isNaN(factor) || factor <= 0) {
		return json({ error: 'conversion_factor must be a positive number' }, { status: 422 });
	}

	// Upsert the conversion rule
	dbClient.prepare(`
		INSERT INTO unit_conversions (supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(supplier_name, ingredient, purchase_unit)
		DO UPDATE SET canonical_unit = excluded.canonical_unit,
		              conversion_factor = excluded.conversion_factor
	`).run(supplier_name.trim(), ingredient.trim(), purchase_unit.trim(), canonical_unit.trim(), factor);

	// Clear pending flags only for the matching supplier's line items
	dbClient.prepare(`
		UPDATE invoice_line_items
		SET requires_unit_conversion = 0,
		    canonical_unit = ?
		WHERE description = ?
		  AND unit = ?
		  AND requires_unit_conversion = 1
		  AND invoice_id IN (
		      SELECT i.id FROM invoices i
		      JOIN suppliers s ON i.supplier_id = s.id
		      WHERE s.name = ?
		  )
	`).run(canonical_unit.trim(), ingredient.trim(), purchase_unit.trim(), supplier_name.trim());

	return json({ ok: true, message: `Rule saved: 1 ${purchase_unit} = ${factor} ${canonical_unit}` });
};
