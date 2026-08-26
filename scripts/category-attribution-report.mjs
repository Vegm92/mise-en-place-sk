#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 0 of "spend category: from the supplier to the line" — read-only.
 *
 * Answers the three questions that decide whether the product catalogue has to
 * be categorised (Phase 1) before the money is re-attributed (Phase 2):
 *
 *   A  How much line spend has no product at all? That share can never be split
 *      finely and will always fall back to the supplier's tag.
 *   B  How much money would change bucket TODAY if attribution moved to
 *      COALESCE(products.category, suppliers.category, 'Other')? Expected to be
 *      ~0, because products currently only echo the supplier they were created
 *      under. A high number means there is more signal than expected and
 *      Phase 1 can be deferred.
 *   C  How many products would have to be categorised, and how much spend rides
 *      on them?
 *
 * Usage:
 *   DATABASE_URL=… node scripts/category-attribution-report.mjs [--months 12]
 *   DATABASE_URL=… node scripts/category-attribution-report.mjs --json
 *
 * Read-only: every statement is a SELECT. Safe against production.
 */
import 'dotenv/config';
import postgres from 'postgres';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const monthsIdx = args.indexOf('--months');
const months = monthsIdx >= 0 ? Number(args[monthsIdx + 1]) : 12;
if (!Number.isFinite(months) || months <= 0) {
	throw new Error('--months must be a positive number');
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const isLocal = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(
	new URL(url).hostname,
);
const sql = postgres(url, { ssl: isLocal ? false : 'require', max: 1 });

const LINE_AMOUNT = sql`COALESCE(ili.total_price, (ili.unit_price * ili.quantity)::numeric, 0)::numeric`;
const interval = `${months} months`;
const SINCE = sql`(CURRENT_DATE - ${interval}::interval)::date`;

/** A — weight of the lines with no product: what can never be split finely. */
async function queryA() {
	return sql`
		SELECT
			r.name                                              AS restaurant,
			COUNT(*)::int                                       AS line_count,
			COUNT(*) FILTER (WHERE ili.product_id IS NULL)::int  AS orphan_lines,
			ROUND(SUM(${LINE_AMOUNT}), 2)                        AS total_spend,
			ROUND(SUM(${LINE_AMOUNT}) FILTER (WHERE ili.product_id IS NULL), 2) AS orphan_spend,
			ROUND(
				100 * SUM(${LINE_AMOUNT}) FILTER (WHERE ili.product_id IS NULL)
				/ NULLIF(SUM(${LINE_AMOUNT}), 0), 2
			)                                                   AS orphan_pct
		FROM invoice_line_items ili
		JOIN invoices i    ON i.id = ili.invoice_id
		JOIN restaurants r ON r.id = i.restaurant_id
		WHERE i.deleted_at IS NULL
		  AND i.invoice_date IS NOT NULL
		  AND i.invoice_date >= ${SINCE}
		  AND ili.description IS NOT NULL AND ili.description <> ''
		GROUP BY r.name
		ORDER BY orphan_spend DESC NULLS LAST
	`;
}

/**
 * B — the signal products already carry: spend whose bucket would move if the
 * line's product decided the category instead of the invoice's supplier.
 */
async function queryB() {
	return sql`
		WITH lines AS (
			SELECT
				r.name                                     AS restaurant,
				COALESCE(s.category, 'Other')              AS supplier_bucket,
				COALESCE(p.category, s.category, 'Other')  AS line_bucket,
				${LINE_AMOUNT}                             AS amount
			FROM invoice_line_items ili
			JOIN invoices i      ON i.id = ili.invoice_id
			JOIN suppliers s     ON s.id = i.supplier_id
			JOIN restaurants r   ON r.id = i.restaurant_id
			LEFT JOIN products p ON p.id = ili.product_id
			WHERE i.deleted_at IS NULL
			  AND i.invoice_date IS NOT NULL
			  AND i.invoice_date >= ${SINCE}
			  AND ili.description IS NOT NULL AND ili.description <> ''
		)
		SELECT
			restaurant,
			ROUND(SUM(amount), 2)                                                    AS total_spend,
			ROUND(SUM(amount) FILTER (WHERE supplier_bucket <> line_bucket), 2)      AS moved_spend,
			COUNT(*) FILTER (WHERE supplier_bucket <> line_bucket)::int              AS moved_lines,
			ROUND(
				100 * SUM(amount) FILTER (WHERE supplier_bucket <> line_bucket)
				/ NULLIF(SUM(amount), 0), 2
			)                                                                        AS moved_pct
		FROM lines
		GROUP BY restaurant
		ORDER BY moved_spend DESC NULLS LAST
	`;
}

/** C — size of the categorisation job, weighted by the spend that rides on it. */
async function queryC() {
	return sql`
		SELECT
			r.name                                                            AS restaurant,
			COUNT(*)::int                                                     AS products,
			COUNT(*) FILTER (WHERE p.category IS NULL)::int                   AS without_category,
			COUNT(*) FILTER (WHERE p.category = 'Other')::int                 AS explicit_other,
			COUNT(*) FILTER (
				WHERE p.category IS NOT NULL AND p.category <> 'Other'
			)::int                                                            AS categorised,
			ROUND(COALESCE(
				SUM(spend.line_spend) FILTER (WHERE p.category IS NULL OR p.category = 'Other'),
				0
			), 2)                                                             AS uncategorised_spend
		FROM products p
		JOIN restaurants r ON r.id = p.restaurant_id
		LEFT JOIN LATERAL (
			SELECT SUM(${LINE_AMOUNT}) AS line_spend
			FROM invoice_line_items ili
			JOIN invoices i ON i.id = ili.invoice_id
			WHERE ili.product_id = p.id
			  AND i.deleted_at IS NULL
			  AND i.invoice_date >= ${SINCE}
		) spend ON TRUE
		GROUP BY r.name
		ORDER BY without_category DESC
	`;
}

function table(title, rows) {
	console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 68 - title.length))}`);
	if (rows.length === 0) {
		console.log('  (no rows)');
		return;
	}
	const cols = Object.keys(rows[0]);
	const width = (c) =>
		Math.max(c.length, ...rows.map((r) => String(r[c] ?? '—').length));
	const widths = Object.fromEntries(cols.map((c) => [c, width(c)]));
	console.log('  ' + cols.map((c) => c.padEnd(widths[c])).join('  '));
	for (const row of rows) {
		console.log('  ' + cols.map((c) => String(row[c] ?? '—').padEnd(widths[c])).join('  '));
	}
}

const [a, b, c] = [await queryA(), await queryB(), await queryC()];

if (asJson) {
	console.log(JSON.stringify({ months, a, b, c }, null, 2));
} else {
	console.log(`Category attribution report — last ${months} month(s)`);
	table('A · lines with no product (never finely split)', [...a]);
	table('B · spend that would change bucket today', [...b]);
	table('C · catalogue left to categorise', [...c]);
	console.log(
		'\nReading it: B ≈ 0 with a high C confirms products only echo their supplier —\n' +
		'Phase 1 (categorise the catalogue) must land before Phase 2 (attribute by line).\n' +
		'A high B means the catalogue already carries its own signal and Phase 2 can go first.\n' +
		'A sizes the remainder that will keep falling back to the supplier tag.\n',
	);
}

await sql.end();
