import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invoiceLineItems, invoices, suppliers } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';
import { CATEGORY_COLORS } from '$lib/constants';

const PERIOD_CLAUSE: Record<string, string> = {
	month:   `AND i.invoice_date >= DATE_TRUNC('month', NOW())::text`,
	quarter: `AND i.invoice_date >= (NOW() - INTERVAL '3 months')::date::text`,
	half:    `AND i.invoice_date >= (NOW() - INTERVAL '6 months')::date::text`,
	all:     '',
};

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	try {
		let period = url.searchParams.get('period') ?? 'month';
		if (!(period in PERIOD_CLAUSE)) period = 'month';
		const dateClause = PERIOD_CLAUSE[period] ?? '';

		type TopItem = { description: string; total_spend: number; item_count: number; avg_unit_price: number | null; supplier_name: string };
		type CatRow = { category: string; total: number; invoice_count: number };
		type KpisRow = { total_items_spend: number | null; total_line_items: number; unique_items: number; avg_invoice_items: number | null };

		const [topItems, categorySpend, kpisRows] = await Promise.all([
			db.execute<TopItem>(sql.raw(`
				SELECT
					MIN(ili.description) AS description,
					SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_spend,
					COUNT(*) AS item_count,
					AVG(NULLIF(ili.unit_price, 0)) AS avg_unit_price,
					STRING_AGG(DISTINCT s.name, ', ') AS supplier_name
				FROM invoice_line_items ili
				JOIN invoices i ON i.id = ili.invoice_id
				JOIN suppliers s ON s.id = i.supplier_id
				WHERE ili.description IS NOT NULL AND ili.description != ''
				  AND i.restaurant_id = '${rid}'
				  ${dateClause}
				GROUP BY LOWER(TRIM(ili.description))
				ORDER BY total_spend DESC
				LIMIT 15
			`)),

			db.execute<CatRow>(sql.raw(`
				SELECT
					COALESCE(s.category, 'Other') AS category,
					SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total,
					COUNT(DISTINCT i.id) AS invoice_count
				FROM invoice_line_items ili
				JOIN invoices i ON i.id = ili.invoice_id
				JOIN suppliers s ON s.id = i.supplier_id
				WHERE ili.description IS NOT NULL AND ili.description != ''
				  AND i.restaurant_id = '${rid}'
				  ${dateClause}
				GROUP BY COALESCE(s.category, 'Other')
				ORDER BY total DESC
			`)),

			db.execute<KpisRow>(sql.raw(`
				SELECT
					SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_items_spend,
					COUNT(*) AS total_line_items,
					COUNT(DISTINCT LOWER(TRIM(ili.description))) AS unique_items,
					COUNT(*)::float / NULLIF(COUNT(DISTINCT ili.invoice_id), 0) AS avg_invoice_items
				FROM invoice_line_items ili
				JOIN invoices i ON i.id = ili.invoice_id
				JOIN suppliers s ON s.id = i.supplier_id
				WHERE ili.description IS NOT NULL AND ili.description != ''
				  AND i.restaurant_id = '${rid}'
				  ${dateClause}
			`)),
		]);

		const maxSpend = Number(topItems[0]?.total_spend) || 1;
		const top_items = topItems.map(item => ({
			...item,
			total_spend: Number(item.total_spend),
			pct: Math.round((Number(item.total_spend) || 0) / maxSpend * 100),
		}));

		const maxCat = Number(categorySpend[0]?.total) || 1;
		const category_spend = categorySpend.map(cat => ({
			category: String(cat.category),
			total: Number(cat.total),
			invoice_count: Number(cat.invoice_count),
			pct: Math.round((Number(cat.total) || 0) / maxCat * 100),
			color: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS['Other'],
		}));

		const kpis = kpisRows[0] ?? { total_items_spend: 0, total_line_items: 0, unique_items: 0, avg_invoice_items: null };

		return { title: 'Spend Analysis', top_items, category_spend, kpis, period };
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[analytics/spend] load failed', e);
		error(500, 'Failed to load spend analytics');
	}
};
