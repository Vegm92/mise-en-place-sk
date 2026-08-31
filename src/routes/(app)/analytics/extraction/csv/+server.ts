import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { toCsv } from '$lib/reports';
import { trackEvent } from '$lib/server/events';
import { contentDispositionHeader } from '$lib/server/content-disposition';

const MAX_ROWS = 5000;

interface CorrectionRow extends Record<string, unknown> {
	corrected_at: string | null;
	supplier_name: string | null;
	invoice_id: number | null;
	field_name: string;
	line_item_index: number | null;
	original_value: string | null;
	corrected_value: string | null;
	field_confidence: number | null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/');

	const rows = await db.execute<CorrectionRow>(sql`
		SELECT
			to_char(ec.corrected_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS corrected_at,
			s.name AS supplier_name,
			ec.invoice_id,
			ec.field_name,
			ec.line_item_index,
			ec.original_value,
			ec.corrected_value,
			ec.field_confidence
		FROM extraction_corrections ec
		LEFT JOIN suppliers s ON s.id = ec.supplier_id AND s.restaurant_id = ec.restaurant_id
		WHERE ec.restaurant_id = ${rid}
		ORDER BY ec.corrected_at DESC
		LIMIT ${MAX_ROWS}
	`);

	trackEvent('extraction_corrections_exported', rid, { row_count: rows.length });

	const csv = toCsv(
		['corrected_at', 'supplier', 'invoice_id', 'field', 'line_index', 'original_value', 'corrected_value', 'field_confidence'],
		rows.map((r) => [
			r.corrected_at,
			r.supplier_name,
			r.invoice_id,
			r.field_name,
			r.line_item_index,
			r.original_value,
			r.corrected_value,
			r.field_confidence == null ? null : Number(r.field_confidence),
		]),
	);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': contentDispositionHeader('attachment', 'extraction-corrections.csv'),
		},
	});
};
