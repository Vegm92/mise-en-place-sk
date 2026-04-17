import type { PageServerLoad } from './$types';
import { dbClient } from '$lib/server/db';
import { CATEGORY_COLORS } from '$lib/constants';

const PERIOD_FILTER: Record<string, string> = {
	month:   "AND i.invoice_date >= date('now', 'start of month')",
	quarter: "AND i.invoice_date >= date('now', '-3 months')",
	half:    "AND i.invoice_date >= date('now', '-6 months')",
	all:     '',
};

export const load: PageServerLoad = async ({ url }) => {
	let period = url.searchParams.get('period') ?? 'month';
	if (!(period in PERIOD_FILTER)) period = 'month';

	const dateFilter = PERIOD_FILTER[period];

	const topItems = dbClient.prepare(`
		SELECT
			MIN(ili.description) AS description,
			SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_spend,
			COUNT(*) AS item_count,
			AVG(NULLIF(ili.unit_price, 0)) AS avg_unit_price,
			GROUP_CONCAT(DISTINCT s.name) AS supplier_name
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		JOIN suppliers s ON s.id = i.supplier_id
		WHERE ili.description IS NOT NULL AND ili.description != ''
		${dateFilter}
		GROUP BY LOWER(TRIM(ili.description))
		ORDER BY total_spend DESC
		LIMIT 15
	`).all() as {
		description: string;
		total_spend: number;
		item_count: number;
		avg_unit_price: number | null;
		supplier_name: string;
	}[];

	const maxSpend = topItems[0]?.total_spend || 1;
	const topItemsWithPct = topItems.map((item) => ({
		...item,
		pct: Math.round((item.total_spend || 0) / maxSpend * 100),
	}));

	const categorySpend = dbClient.prepare(`
		SELECT
			COALESCE(s.category, 'Other') AS category,
			SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total,
			COUNT(DISTINCT i.id) AS invoice_count
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		JOIN suppliers s ON s.id = i.supplier_id
		WHERE ili.description IS NOT NULL AND ili.description != ''
		${dateFilter}
		GROUP BY COALESCE(s.category, 'Other')
		ORDER BY total DESC
	`).all() as { category: string; total: number; invoice_count: number }[];

	const maxCat = categorySpend[0]?.total || 1;
	const categorySpendWithPct = categorySpend.map((cat) => ({
		...cat,
		pct: Math.round((cat.total || 0) / maxCat * 100),
		color: CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS['Other'],
	}));

	const kpisRow = dbClient.prepare(`
		SELECT
			SUM(COALESCE(ili.total_price, ili.unit_price * ili.quantity, 0)) AS total_items_spend,
			COUNT(*) AS total_line_items,
			COUNT(DISTINCT LOWER(TRIM(ili.description))) AS unique_items,
			CAST(COUNT(*) AS REAL) / NULLIF(COUNT(DISTINCT ili.invoice_id), 0) AS avg_invoice_items
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		JOIN suppliers s ON s.id = i.supplier_id
		WHERE ili.description IS NOT NULL AND ili.description != ''
		${dateFilter}
	`).get() as {
		total_items_spend: number | null;
		total_line_items: number;
		unique_items: number;
		avg_invoice_items: number | null;
	} | undefined;

	return {
		title: 'Spend Analysis',
		top_items: topItemsWithPct,
		category_spend: categorySpendWithPct,
		kpis: kpisRow ?? { total_items_spend: 0, total_line_items: 0, unique_items: 0, avg_invoice_items: null },
		period,
	};
};
