import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import { db, forTenant } from '$lib/server/db';
import { suppliers } from '$lib/server/schema';
import { sql } from 'drizzle-orm';
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

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	return handleLoad('analytics/prices', async () => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	const { features } = await parent();
	if (!features.supplierScores) redirect(303, '/billing?upgrade=prices');
	const supplierIdParam = url.searchParams.get('supplier_id');
	const supplierId = supplierIdParam ? Number(supplierIdParam) : null;

	const supplierFilter = supplierId ? sql`AND supplier_id = ${supplierId}` : sql``;

	// Read from mv_price_snapshots (pre-computed latest+prev price per item+supplier).
	// Replaces the self-joining window CTE that scanned all invoice_line_items.
	const rawRows = await db.execute(sql`
		SELECT
			description,
			supplier_name,
			supplier_id,
			unit,
			latest_date,
			latest_price,
			prev_price,
			prev_date,
			change_pct
		FROM mv_price_snapshots
		WHERE restaurant_id = ${rid}
		  ${supplierFilter}
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
		.where(tdb.scope(suppliers.restaurantId))
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
	});
};
