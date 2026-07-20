import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

interface KpisRow extends Record<string, unknown> {
	total_invoices: number;
	auto_confirmed: number;
	auto_confirmed_rate: number | null;
	avg_corrections: number | null;
	most_accurate_supplier: string | null;
}

interface FieldRow extends Record<string, unknown> {
	field_name: string;
	corrections: number;
	invoice_pct: number | null;
}

interface SupplierRow extends Record<string, unknown> {
	supplier_name: string;
	total_invoices: number;
	auto_confirmed: number;
	auto_confirmed_rate: number | null;
	avg_corrections: number | null;
}

interface TrendRow extends Record<string, unknown> {
	month: string;
	total_invoices: number;
	auto_confirmed: number;
	auto_confirmed_rate: number | null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	return handleLoad('analytics/extraction', async () => {
		// kpisRows, supplierRows, trendRows read from mv_extraction_stats (pre-aggregated).
		// fieldRows still queries extraction_corrections directly (no rollup needed — it's a small table).
		const [kpisRows, fieldRows, supplierRows, trendRows] = await Promise.all([
			db.execute<KpisRow>(sql`
				SELECT
					COUNT(DISTINCT es.invoice_id) AS total_invoices,
					SUM(CASE WHEN es.correction_count = 0 THEN 1 ELSE 0 END) AS auto_confirmed,
					ROUND(
						(SUM(CASE WHEN es.correction_count = 0 THEN 1 ELSE 0 END)::float /
						NULLIF(COUNT(DISTINCT es.invoice_id), 0) * 100)::numeric, 1
					) AS auto_confirmed_rate,
					ROUND(
						(SUM(es.correction_count)::float / NULLIF(COUNT(DISTINCT es.invoice_id), 0))::numeric, 2
					) AS avg_corrections,
					(
						SELECT s.name
						FROM mv_extraction_stats es2
						JOIN suppliers s ON s.id = es2.supplier_id
						WHERE es2.restaurant_id = ${rid}
						  AND es2.supplier_id IS NOT NULL
						GROUP BY s.id, s.name
						ORDER BY (
							SUM(CASE WHEN es2.correction_count = 0 THEN 1 ELSE 0 END)::float /
							NULLIF(COUNT(DISTINCT es2.invoice_id), 0)
						) DESC
						LIMIT 1
					) AS most_accurate_supplier
				FROM mv_extraction_stats es
				WHERE es.restaurant_id = ${rid}
			`),

			db.execute<FieldRow>(sql`
				SELECT
					ec.field_name,
					COUNT(*) AS corrections,
					ROUND(
						(COUNT(DISTINCT ec.invoice_id)::float /
						NULLIF((SELECT COUNT(*) FROM invoices WHERE restaurant_id = ${rid}), 0) * 100)::numeric, 1
					) AS invoice_pct
				FROM extraction_corrections ec
				WHERE ec.restaurant_id = ${rid}
				GROUP BY ec.field_name
				ORDER BY corrections DESC
				LIMIT 10
			`),

			db.execute<SupplierRow>(sql`
				SELECT
					s.name AS supplier_name,
					COUNT(DISTINCT es.invoice_id) AS total_invoices,
					SUM(CASE WHEN es.correction_count = 0 THEN 1 ELSE 0 END) AS auto_confirmed,
					ROUND(
						(SUM(CASE WHEN es.correction_count = 0 THEN 1 ELSE 0 END)::float /
						NULLIF(COUNT(DISTINCT es.invoice_id), 0) * 100)::numeric, 1
					) AS auto_confirmed_rate,
					ROUND(
						(SUM(es.correction_count)::float / NULLIF(COUNT(DISTINCT es.invoice_id), 0))::numeric, 2
					) AS avg_corrections
				FROM mv_extraction_stats es
				JOIN suppliers s ON s.id = es.supplier_id
				WHERE es.restaurant_id = ${rid}
				  AND es.supplier_id IS NOT NULL
				GROUP BY s.name
				ORDER BY total_invoices DESC
				LIMIT 20
			`),

			db.execute<TrendRow>(sql`
				SELECT
					TO_CHAR(es.month, 'YYYY-MM') AS month,
					COUNT(DISTINCT es.invoice_id) AS total_invoices,
					SUM(CASE WHEN es.correction_count = 0 THEN 1 ELSE 0 END) AS auto_confirmed,
					ROUND(
						(SUM(CASE WHEN es.correction_count = 0 THEN 1 ELSE 0 END)::float /
						NULLIF(COUNT(DISTINCT es.invoice_id), 0) * 100)::numeric, 1
					) AS auto_confirmed_rate
				FROM mv_extraction_stats es
				WHERE es.restaurant_id = ${rid}
				GROUP BY es.month
				ORDER BY es.month ASC
				LIMIT 12
			`),
		]);

		const kpis = kpisRows[0] ?? {
			total_invoices: 0,
			auto_confirmed: 0,
			auto_confirmed_rate: null,
			avg_corrections: null,
			most_accurate_supplier: null,
		};

		const hasData = Number(kpis.total_invoices) > 0;

		return {
			title: 'extract.pageTitle',
			kpis: {
				total_invoices: Number(kpis.total_invoices),
				auto_confirmed: Number(kpis.auto_confirmed),
				auto_confirmed_rate: kpis.auto_confirmed_rate != null ? Number(kpis.auto_confirmed_rate) : null,
				avg_corrections: kpis.avg_corrections != null ? Number(kpis.avg_corrections) : null,
				most_accurate_supplier: kpis.most_accurate_supplier ?? null,
			},
			field_corrections: fieldRows.map(r => ({
				field_name: String(r.field_name),
				corrections: Number(r.corrections),
				invoice_pct: r.invoice_pct != null ? Number(r.invoice_pct) : null,
			})),
			supplier_accuracy: supplierRows.map(r => ({
				supplier_name: String(r.supplier_name),
				total_invoices: Number(r.total_invoices),
				auto_confirmed: Number(r.auto_confirmed),
				auto_confirmed_rate: r.auto_confirmed_rate != null ? Number(r.auto_confirmed_rate) : null,
				avg_corrections: r.avg_corrections != null ? Number(r.avg_corrections) : null,
			})),
			trend: trendRows.map(r => ({
				month: String(r.month),
				total_invoices: Number(r.total_invoices),
				auto_confirmed: Number(r.auto_confirmed),
				auto_confirmed_rate: r.auto_confirmed_rate != null ? Number(r.auto_confirmed_rate) : null,
			})),
			hasData,
		};
	});
};
