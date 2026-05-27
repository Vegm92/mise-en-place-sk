import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { invoiceLineItems, invoices, suppliers } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

interface PriceRow {
	description: string;
	supplier_name: string;
	supplier_id: number;
	unit: string | null;
	latest_date: string;
	latest_price: number;
	prev_price: number | null;
	prev_date: string | null;
	change_pct: number | null;
}

interface SupplierRow {
	id: number;
	name: string;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	try {
	const rid = locals.restaurantId!;
	const supplierIdParam = url.searchParams.get('supplier_id');
	const supplierId = supplierIdParam ? Number(supplierIdParam) : null;

	const supplierFilter = supplierId ? sql`AND s.id = ${supplierId}` : sql``;

	const rawRows = await db.execute(sql`
		WITH history AS (
			SELECT
				ili.description,
				s.id            AS supplier_id,
				s.name          AS supplier_name,
				i.invoice_date,
				ili.unit_price,
				ili.unit,
				ROW_NUMBER() OVER (
					PARTITION BY ili.description, s.id
					ORDER BY i.invoice_date DESC
				) AS rn
			FROM ${invoiceLineItems} ili
			JOIN ${invoices} i ON i.id = ili.invoice_id
			JOIN ${suppliers} s ON s.id = i.supplier_id
			WHERE ili.unit_price IS NOT NULL
			  AND ili.description IS NOT NULL
			  AND ili.description != ''
			  AND i.restaurant_id = ${rid}
			  ${supplierFilter}
		)
		SELECT * FROM (
			SELECT
				l.description,
				l.supplier_name,
				l.supplier_id,
				l.unit,
				l.invoice_date  AS latest_date,
				l.unit_price    AS latest_price,
				p.unit_price    AS prev_price,
				p.invoice_date  AS prev_date,
				CASE
					WHEN p.unit_price IS NOT NULL AND p.unit_price > 0
					THEN ROUND(((l.unit_price - p.unit_price) / p.unit_price * 100.0)::numeric, 1)
					ELSE NULL
				END AS change_pct
			FROM history l
			LEFT JOIN history p
			       ON p.description = l.description
			      AND p.supplier_id  = l.supplier_id
			      AND p.rn = 2
			WHERE l.rn = 1
		) sub
		ORDER BY ABS(COALESCE(change_pct, 0)) DESC
	`);
	const rows = rawRows as unknown as PriceRow[];

	const items = rows.sort((a, b) => {
		const aAbs = a.change_pct !== null ? Math.abs(a.change_pct) : -1;
		const bAbs = b.change_pct !== null ? Math.abs(b.change_pct) : -1;
		return bAbs - aAbs;
	});

	const top_increases = items.filter((r) => r.change_pct !== null && r.change_pct > 0).slice(0, 3);
	const top_decreases = items
		.filter((r) => r.change_pct !== null && r.change_pct < 0)
		.sort((a, b) => (a.change_pct ?? 0) - (b.change_pct ?? 0))
		.slice(0, 3);

	const supplierList = await db.select({ id: suppliers.id, name: suppliers.name })
		.from(suppliers)
		.where(eq(suppliers.restaurantId, rid))
		.orderBy(suppliers.name) as SupplierRow[];

	return {
		title: 'Price Tracking',
		subtitle: 'Unit price changes across suppliers',
		items,
		suppliers: supplierList,
		top_increases,
		top_decreases,
		selected_supplier: supplierId,
	};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[analytics/prices] load failed', e);
		error(500, 'Failed to load price analytics');
	}
};
