import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	const rid        = locals.restaurantId!;
	const status     = url.searchParams.get('status') ?? '';
	const supplierId = url.searchParams.get('supplier_id') ?? '';
	const dateFrom   = url.searchParams.get('date_from') ?? '';
	const dateTo     = url.searchParams.get('date_to') ?? '';

	const conditions: SQL[] = [eq(invoices.restaurantId, rid)];
	if (status)     conditions.push(eq(invoices.status, status));
	if (supplierId) conditions.push(eq(invoices.supplierId, parseInt(supplierId, 10)));
	if (dateFrom)   conditions.push(gte(invoices.invoiceDate, dateFrom));
	if (dateTo)     conditions.push(lte(invoices.invoiceDate, dateTo));

	const rows = await db
		.select({
			id:             invoices.id,
			supplier:       suppliers.name,
			invoice_number: invoices.invoiceNumber,
			invoice_date:   invoices.invoiceDate,
			due_date:       invoices.dueDate,
			total_amount:   invoices.totalAmount,
			status:         invoices.status,
			created_at:     invoices.createdAt,
		})
		.from(invoices)
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(and(...conditions))
		.orderBy(desc(invoices.invoiceDate));

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
