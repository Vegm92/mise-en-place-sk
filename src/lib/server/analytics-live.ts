import { sql, type SQL } from 'drizzle-orm';
import { forTenant } from './db';
import { invoiceLineItems, invoices } from './schema';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin } from './category-spend';

type Month = string | SQL;

export function liveCategoryMonthlySpend(rid: string, monthFrom: Month, monthTo: Month): SQL {
	const tdb = forTenant(rid);
	const lineMonth = sql`TO_CHAR(invoices.invoice_date, 'YYYY-MM')`;
	return sql`
		SELECT
			${lineCategoryExpr()}       AS category,
			${lineMonth}                AS month,
			SUM(${lineAmountExpr()})    AS total_spend,
			COUNT(DISTINCT invoices.id) AS invoice_count
		FROM invoice_line_items
		JOIN invoices ON invoices.id = invoice_line_items.invoice_id
		JOIN suppliers ON suppliers.id = invoices.supplier_id
		${lineProductJoin()}
		WHERE ${tdb.scope(invoices.restaurantId)}
		  AND ${tdb.scope(invoiceLineItems.restaurantId)}
		  AND invoices.deleted_at IS NULL
		  AND ${describedLine()}
		  AND invoices.invoice_date >= TO_DATE(${monthFrom}, 'YYYY-MM')
		  AND invoices.invoice_date < TO_DATE(${monthTo}, 'YYYY-MM') + INTERVAL '1 month'
		GROUP BY ${lineCategoryExpr()}, ${lineMonth}
	`;
}

export function livePriceSnapshots(rid: string, itemKeys: SQL): SQL {
	const tdb = forTenant(rid);
	return sql`
		SELECT
			supplier_id, supplier_name, item_key, description, unit,
			invoice_date          AS latest_date,
			unit_price            AS latest_price,
			normalized_unit_price AS latest_normalized_price,
			base_unit, prev_price, prev_date,
			CASE
				WHEN prev_price IS NOT NULL AND prev_price > 0
				THEN ROUND(((unit_price - prev_price) / prev_price * 100.0)::numeric, 1)
				ELSE NULL
			END AS change_pct
		FROM (
			SELECT
				suppliers.id   AS supplier_id,
				suppliers.name AS supplier_name,
				mep_norm_key(invoice_line_items.description) AS item_key,
				invoice_line_items.description,
				invoice_line_items.unit,
				invoices.invoice_date,
				invoice_line_items.unit_price,
				invoice_line_items.normalized_unit_price,
				invoice_line_items.base_unit,
				ROW_NUMBER() OVER w AS rn,
				LEAD(invoice_line_items.unit_price) OVER w AS prev_price,
				LEAD(invoices.invoice_date) OVER w AS prev_date
			FROM invoice_line_items
			JOIN invoices ON invoices.id = invoice_line_items.invoice_id
			JOIN suppliers ON suppliers.id = invoices.supplier_id
			WHERE ${tdb.scope(invoices.restaurantId)}
			  AND ${tdb.scope(invoiceLineItems.restaurantId)}
			  AND invoices.deleted_at IS NULL
			  AND ${describedLine()}
			  AND invoice_line_items.unit_price IS NOT NULL
			  AND mep_norm_key(invoice_line_items.description) IN (${itemKeys})
			WINDOW w AS (
				PARTITION BY mep_norm_key(invoice_line_items.description), suppliers.id
				ORDER BY invoices.invoice_date DESC, invoices.id DESC
			)
		) ordered
		WHERE rn = 1
	`;
}

export function liveExtractionStats(rid: string): SQL {
	return sql`
		SELECT
			invoices.id                            AS invoice_id,
			invoices.supplier_id,
			DATE_TRUNC('month', invoices.created_at) AS month,
			COUNT(extraction_corrections.id)       AS correction_count
		FROM invoices
		LEFT JOIN extraction_corrections
		       ON extraction_corrections.invoice_id    = invoices.id
		      AND extraction_corrections.restaurant_id = invoices.restaurant_id
		WHERE ${forTenant(rid).scope(invoices.restaurantId)}
		  AND invoices.deleted_at IS NULL
		GROUP BY invoices.id
	`;
}
