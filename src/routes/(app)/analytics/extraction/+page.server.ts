import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
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
	try {
		const [kpisRows, fieldRows, supplierRows, trendRows] = await Promise.all([
			db.execute<KpisRow>(sql.raw(`
				WITH invoice_corrections AS (
					SELECT
						i.id AS invoice_id,
						COUNT(ec.id) AS correction_count
					FROM invoices i
					LEFT JOIN extraction_corrections ec ON ec.invoice_id = i.id AND ec.restaurant_id = '${rid}'
					WHERE i.restaurant_id = '${rid}'
					GROUP BY i.id
				),
				supplier_stats AS (
					SELECT
						s.name AS supplier_name,
						COUNT(DISTINCT ic.invoice_id) AS total_invoices,
						SUM(CASE WHEN ic.correction_count = 0 THEN 1 ELSE 0 END) AS auto_confirmed
					FROM invoice_corrections ic
					JOIN invoices i ON i.id = ic.invoice_id
					JOIN suppliers s ON s.id = i.supplier_id
					WHERE i.restaurant_id = '${rid}'
					GROUP BY s.name
					ORDER BY (SUM(CASE WHEN ic.correction_count = 0 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(DISTINCT ic.invoice_id), 0)) DESC
					LIMIT 1
				)
				SELECT
					COUNT(DISTINCT ic.invoice_id) AS total_invoices,
					SUM(CASE WHEN ic.correction_count = 0 THEN 1 ELSE 0 END) AS auto_confirmed,
					ROUND(
						(SUM(CASE WHEN ic.correction_count = 0 THEN 1 ELSE 0 END)::float /
						NULLIF(COUNT(DISTINCT ic.invoice_id), 0) * 100)::numeric, 1
					) AS auto_confirmed_rate,
					ROUND(
						(SUM(ic.correction_count)::float / NULLIF(COUNT(DISTINCT ic.invoice_id), 0))::numeric, 2
					) AS avg_corrections,
					(SELECT supplier_name FROM supplier_stats LIMIT 1) AS most_accurate_supplier
				FROM invoice_corrections ic
			`)),

			db.execute<FieldRow>(sql.raw(`
				SELECT
					ec.field_name,
					COUNT(*) AS corrections,
					ROUND(
						(COUNT(DISTINCT ec.invoice_id)::float /
						NULLIF((SELECT COUNT(*) FROM invoices WHERE restaurant_id = '${rid}'), 0) * 100)::numeric, 1
					) AS invoice_pct
				FROM extraction_corrections ec
				WHERE ec.restaurant_id = '${rid}'
				GROUP BY ec.field_name
				ORDER BY corrections DESC
				LIMIT 10
			`)),

			db.execute<SupplierRow>(sql.raw(`
				WITH invoice_corrections AS (
					SELECT
						i.id AS invoice_id,
						i.supplier_id,
						COUNT(ec.id) AS correction_count
					FROM invoices i
					LEFT JOIN extraction_corrections ec ON ec.invoice_id = i.id AND ec.restaurant_id = '${rid}'
					WHERE i.restaurant_id = '${rid}' AND i.supplier_id IS NOT NULL
					GROUP BY i.id, i.supplier_id
				)
				SELECT
					s.name AS supplier_name,
					COUNT(DISTINCT ic.invoice_id) AS total_invoices,
					SUM(CASE WHEN ic.correction_count = 0 THEN 1 ELSE 0 END) AS auto_confirmed,
					ROUND(
						(SUM(CASE WHEN ic.correction_count = 0 THEN 1 ELSE 0 END)::float /
						NULLIF(COUNT(DISTINCT ic.invoice_id), 0) * 100)::numeric, 1
					) AS auto_confirmed_rate,
					ROUND(
						(SUM(ic.correction_count)::float / NULLIF(COUNT(DISTINCT ic.invoice_id), 0))::numeric, 2
					) AS avg_corrections
				FROM invoice_corrections ic
				JOIN suppliers s ON s.id = ic.supplier_id
				GROUP BY s.name
				ORDER BY total_invoices DESC
				LIMIT 20
			`)),

			db.execute<TrendRow>(sql.raw(`
				WITH invoice_corrections AS (
					SELECT
						i.id AS invoice_id,
						DATE_TRUNC('month', i.created_at) AS month,
						COUNT(ec.id) AS correction_count
					FROM invoices i
					LEFT JOIN extraction_corrections ec ON ec.invoice_id = i.id AND ec.restaurant_id = '${rid}'
					WHERE i.restaurant_id = '${rid}'
					GROUP BY i.id, DATE_TRUNC('month', i.created_at)
				)
				SELECT
					TO_CHAR(month, 'YYYY-MM') AS month,
					COUNT(DISTINCT invoice_id) AS total_invoices,
					SUM(CASE WHEN correction_count = 0 THEN 1 ELSE 0 END) AS auto_confirmed,
					ROUND(
						(SUM(CASE WHEN correction_count = 0 THEN 1 ELSE 0 END)::float /
						NULLIF(COUNT(DISTINCT invoice_id), 0) * 100)::numeric, 1
					) AS auto_confirmed_rate
				FROM invoice_corrections
				GROUP BY month
				ORDER BY month ASC
				LIMIT 12
			`)),
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
			title: 'Extracción IA',
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
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[analytics/extraction] load failed', e);
		error(500, 'Failed to load extraction analytics');
	}
};
