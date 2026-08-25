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
	latest_normalized_price: number | null;
	base_unit: string | null;
	prev_price: number | null;
	prev_date: string | null;
	change_pct: number | null;
}

interface SupplierRow {
	id: number;
	name: string;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	return handleLoad('analytics/prices', async () => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	const supplierIdParam = url.searchParams.get('supplier_id');
	const supplierId = supplierIdParam ? Number(supplierIdParam) : null;

	const supplierFilter = supplierId ? sql`AND supplier_id = ${supplierId}` : sql``;

	const rawRows = await db.execute(sql`
		SELECT
			description,
			supplier_name,
			supplier_id,
			unit,
			latest_date,
			latest_price,
			latest_normalized_price,
			base_unit,
			prev_price,
			prev_date,
			change_pct
		FROM mv_price_snapshots
		WHERE restaurant_id = ${rid}
		  ${supplierFilter}
		ORDER BY ABS(COALESCE(change_pct, 0)) DESC
	`);
	const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
	const rows = (rawRows as unknown as PriceRow[]).map((r) => ({
		...r,
		latest_price: Number(r.latest_price),
		latest_normalized_price: num(r.latest_normalized_price),
		prev_price: num(r.prev_price),
		change_pct: num(r.change_pct),
	}));

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
		title: 'prices.pageTitle',
		subtitle: 'Unit price changes across suppliers',
		items,
		suppliers: supplierList,
		top_increases,
		top_decreases,
		selected_supplier: supplierId,
	};
	});
};
