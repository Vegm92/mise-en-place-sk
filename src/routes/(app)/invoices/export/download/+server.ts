import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { and, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { moneyToNullableNumber } from '$lib/server/money';
import { toIsoDate } from '$lib/server/dates';

const REVIEW_STATE_LABELS: Record<string, string> = {
	revisado:    'Revisado',
	por_revisar: 'Por revisar',
	incidencia:  'Incidencia',
};

const HEADER_FILL: ExcelJS.Fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8871E' } };
const BAND_FILL: ExcelJS.Fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
	top:    { style: 'thin', color: { argb: 'FFE5E5E5' } },
	bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const rid        = locals.restaurantId!;
	const tdb        = forTenant(rid);
	const status     = url.searchParams.get('status') ?? '';
	const supplierId = url.searchParams.get('supplier_id') ?? '';
	const dateFrom   = toIsoDate(url.searchParams.get('date_from'));
	const dateTo     = toIsoDate(url.searchParams.get('date_to'));

	const conditions: SQL[] = [tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)];
	if (status)     conditions.push(eq(invoices.reviewState, status));
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
			review_state:   invoices.reviewState,
			created_at:     invoices.createdAt,
		})
		.from(invoices)
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		// tenant-scope-ok: conditions[0] is tdb.scope(invoices.restaurantId)
		.where(and(...conditions))
		.orderBy(desc(invoices.invoiceDate));

	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'Mise en Place';
	workbook.created = new Date();

	const sheet = workbook.addWorksheet('Albaranes', { views: [{ state: 'frozen', ySplit: 1 }] });

	sheet.columns = [
		{ header: 'ID',            key: 'id',             width: 8  },
		{ header: 'Proveedor',     key: 'supplier',       width: 32 },
		{ header: 'Nº albarán',    key: 'invoice_number', width: 16 },
		{ header: 'Fecha',         key: 'invoice_date',   width: 13 },
		{ header: 'Vencimiento',   key: 'due_date',        width: 13 },
		{ header: 'Importe (€)',   key: 'total_amount',   width: 14 },
		{ header: 'Estado',        key: 'status',         width: 13 },
		{ header: 'Creado',        key: 'created_at',     width: 19 },
	];

	for (const r of rows) {
		sheet.addRow({
			id:             r.id,
			supplier:       r.supplier ?? '—',
			invoice_number: r.invoice_number ?? '—',
			invoice_date:   r.invoice_date ?? '—',
			due_date:       r.due_date ?? '—',
			total_amount:   moneyToNullableNumber(r.total_amount),
			status:         REVIEW_STATE_LABELS[r.review_state ?? ''] ?? r.review_state ?? '—',
			created_at:     r.created_at ? r.created_at.toISOString().replace('T', ' ').slice(0, 19) : '—',
		});
	}

	sheet.getColumn('total_amount').numFmt = '#,##0.00';

	const headerRow = sheet.getRow(1);
	headerRow.height = 22;
	headerRow.eachCell((cell) => {
		cell.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill   = HEADER_FILL;
		cell.alignment = { vertical: 'middle' };
	});

	sheet.eachRow((row, rowNumber) => {
		row.eachCell({ includeEmpty: true }, (cell) => {
			cell.border = THIN_BORDER;
			if (rowNumber > 1 && rowNumber % 2 === 0) cell.fill = BAND_FILL;
		});
	});

	sheet.autoFilter = { from: 'A1', to: `H${rows.length + 1}` };

	const buffer = await workbook.xlsx.writeBuffer();

	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="invoices.xlsx"',
		},
	});
};
