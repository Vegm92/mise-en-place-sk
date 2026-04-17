import type { RequestHandler } from './$types';
import { dbClient } from '$lib/server/db';

export const GET: RequestHandler = ({ url }) => {
	const status     = url.searchParams.get('status') ?? '';
	const supplierId = url.searchParams.get('supplier_id') ?? '';
	const dateFrom   = url.searchParams.get('date_from') ?? '';
	const dateTo     = url.searchParams.get('date_to') ?? '';

	const filters: string[] = [];
	const params: (string | number)[] = [];

	if (status)     { filters.push('i.status = ?');       params.push(status); }
	if (supplierId) { filters.push('i.supplier_id = ?');  params.push(parseInt(supplierId, 10)); }
	if (dateFrom)   { filters.push('i.invoice_date >= ?'); params.push(dateFrom); }
	if (dateTo)     { filters.push('i.invoice_date <= ?'); params.push(dateTo); }

	const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

	const rows = dbClient.prepare(`
		SELECT i.id, s.name AS supplier, i.invoice_number, i.invoice_date, i.due_date,
		       i.total_amount, i.status, i.created_at
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		${where}
		ORDER BY i.invoice_date DESC
	`).all(...params) as {
		id: number;
		supplier: string | null;
		invoice_number: string | null;
		invoice_date: string | null;
		due_date: string | null;
		total_amount: number | null;
		status: string | null;
		created_at: string | null;
	}[];

	const header = 'id,supplier,invoice_number,invoice_date,due_date,total_amount,status,created_at\r\n';
	const lines = rows.map((r) =>
		[r.id, r.supplier ?? '', r.invoice_number ?? '', r.invoice_date ?? '',
		 r.due_date ?? '', r.total_amount ?? '', r.status ?? '', r.created_at ?? '']
			.map((v) => `"${String(v).replace(/"/g, '""')}"`)
			.join(',')
	);
	const csv = header + lines.join('\r\n');

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv',
			'Content-Disposition': 'attachment; filename="invoices.csv"',
		},
	});
};
