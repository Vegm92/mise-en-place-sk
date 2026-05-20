import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invoiceLineItems, invoices, suppliers } from '$lib/server/schema';
import { sql } from 'drizzle-orm';
import { CATEGORY_COLORS } from '$lib/constants';

const PERIOD_SQL: Record<string, ReturnType<typeof sql> | null> = {
	month:   sql`AND i.invoice_date >= date('now', 'start of month')`,
	quarter: sql`AND i.invoice_date >= date('now', '-3 months')`,
	half:    sql`AND i.invoice_date >= date('now', '-6 months')`,
	all:     null,
};

export const load: PageServerLoad = async ({ url }) => {
	let period = url.searchParams.get('period') ?? 'month';
	if (!(period in PERIOD_SQL)) period = 'month';

	const dateClause = PERIOD_SQL[period] ?? sql``;

	type TopItem = { description: string; total_spend: number; item_count: number; avg_unit_price: number | null; supplier_name: string };
	const topItems = db.all<TopItem>(sql`
		SELECT
			MIN(ili.description) AS description,
			SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_spend,
			COUNT(*) AS item_count,
			AVG(NULLIF(ili.unit_price, 0)) AS avg_unit_price,
			GROUP_CONCAT(DISTINCT s.name) AS supplier_name
		FROM ${invoiceLineItems} ili
		JOIN ${invoices} i ON i.id = ili.invoice_id
		JOIN ${suppliers} s ON s.id = i.supplier_id
		WHERE ili.description IS NOT NULL AND ili.description != ''
		${dateClause}
		GROUP BY LOWER(TRIM(ili.description))
		ORDER BY total_spend DESC
		LIMIT 15
	`);

	const maxSpend = topItems[0]?.total_spend || 1;
	const top_items = topItems.map((item) => ({
		...item,
		pct: Math.round((item.total_spend || 0) / maxSpend * 100),
	}));

	type CatRow = { category: string; total: number; invoice_count: number };
	const categorySpend = db.all<CatRow>(sql`
		SELECT
			COALESCE(s.category, 'Other') AS category,
			SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total,
			COUNT(DISTINCT i.id) AS invoice_count
		FROM ${invoiceLineItems} ili
		JOIN ${invoices} i ON i.id = ili.invoice_id
		JOIN ${suppliers} s ON s.id = i.supplier_id
		WHERE ili.description IS NOT NULL AND ili.description != ''
		${dateClause}
		GROUP BY COALESCE(s.category, 'Other')
		ORDER BY total DESC
	`);

	const maxCat = categorySpend[0]?.total || 1;
	const category_spend = categorySpend.map((cat) => ({
		...cat,
		pct: Math.round((cat.total || 0) / maxCat * 100),
		color: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS['Other'],
	}));

	type KpisRow = { total_items_spend: number | null; total_line_items: number; unique_items: number; avg_invoice_items: number | null };
	const kpisRow = db.get<KpisRow>(sql`
		SELECT
			SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_items_spend,
			COUNT(*) AS total_line_items,
			COUNT(DISTINCT LOWER(TRIM(ili.description))) AS unique_items,
			CAST(COUNT(*) AS REAL) / NULLIF(COUNT(DISTINCT ili.invoice_id), 0) AS avg_invoice_items
		FROM ${invoiceLineItems} ili
		JOIN ${invoices} i ON i.id = ili.invoice_id
		JOIN ${suppliers} s ON s.id = i.supplier_id
		WHERE ili.description IS NOT NULL AND ili.description != ''
		${dateClause}
	`);

	return {
		title: 'Spend Analysis',
		top_items,
		category_spend,
		kpis: kpisRow ?? { total_items_spend: 0, total_line_items: 0, unique_items: 0, avg_invoice_items: null },
		period,
	};
};
