import { error } from '@sveltejs/kit';
import path from 'path';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { and, desc, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { moneyToNullableNumber } from '$lib/server/money';
import { toIsoDate } from '$lib/server/dates';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { EXPORT_ROW_CAP } from '$lib/server/env';
import { toIntlLocale } from '$lib/formatters';
import { getStorage } from '$lib/server/storage';
import { contentDispositionHeader } from '$lib/server/content-disposition';
import { buildInvoiceExportZip } from '$lib/server/invoice-export-zip';

const POSITIVE_INT = /^[1-9]\d*$/;
const MAX_EXPORT_IDS = 500;

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
	const rid = locals.restaurantId!;

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'export', max: 5 }, { restaurantId: rid }))) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	const tdb          = forTenant(rid);
	const idsParam     = url.searchParams.get('ids') ?? '';
	const format       = url.searchParams.get('format') ?? '';

	let ids: number[] | null = null;
	if (idsParam) {
		const parts = idsParam.split(',').map((p) => p.trim()).filter(Boolean);
		if (parts.length === 0 || parts.length > MAX_EXPORT_IDS || !parts.every((p) => POSITIVE_INT.test(p))) {
			throw error(400, 'Invalid ids');
		}
		ids = parts.map((p) => parseInt(p, 10));
	}

	const conditions: SQL[] = [tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)];

	if (ids) {
		conditions.push(inArray(invoices.id, ids));
	} else {
		const status       = url.searchParams.get('status') ?? '';
		const supplierId   = url.searchParams.get('supplier_id') ?? '';
		const dateFromParam = url.searchParams.get('date_from') ?? '';
		const dateToParam   = url.searchParams.get('date_to') ?? '';

		if (supplierId && !POSITIVE_INT.test(supplierId)) throw error(400, 'Invalid supplier_id');

		const dateFrom = toIsoDate(dateFromParam);
		const dateTo   = toIsoDate(dateToParam);
		if (dateFromParam && !dateFrom) throw error(400, 'Invalid date_from');
		if (dateToParam && !dateTo) throw error(400, 'Invalid date_to');

		if (status)     conditions.push(eq(invoices.reviewState, status));
		if (supplierId) conditions.push(eq(invoices.supplierId, parseInt(supplierId, 10)));
		if (dateFrom)   conditions.push(gte(invoices.invoiceDate, dateFrom));
		if (dateTo)     conditions.push(lte(invoices.invoiceDate, dateTo));
	}

	const fetched = await db
		.select({
			id:             invoices.id,
			supplier:       suppliers.name,
			invoice_number: invoices.invoiceNumber,
			invoice_date:   invoices.invoiceDate,
			due_date:       invoices.dueDate,
			tax_base:       invoices.taxBase,
			total_amount:   invoices.totalAmount,
			review_state:   invoices.reviewState,
			created_at:     invoices.createdAt,
			source_file:    invoices.sourceFile,
		})
		.from(invoices)
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		// tenant-scope-ok: conditions[0] is tdb.scope(invoices.restaurantId)
		.where(and(...conditions))
		.orderBy(desc(invoices.invoiceDate))
		.limit(EXPORT_ROW_CAP + 1);

	const truncated = fetched.length > EXPORT_ROW_CAP;
	const rows      = truncated ? fetched.slice(0, EXPORT_ROW_CAP) : fetched;

	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'Mise en Place';
	workbook.created = new Date();

	const sheet = workbook.addWorksheet('Albaranes', { views: [{ state: 'frozen', ySplit: 1 }] });

	sheet.columns = [
		{ header: 'ID',                 key: 'id',             width: 8  },
		{ header: 'Proveedor',          key: 'supplier',       width: 32 },
		{ header: 'Nº albarán',         key: 'invoice_number', width: 16 },
		{ header: 'Fecha',              key: 'invoice_date',   width: 13 },
		{ header: 'Vencimiento',        key: 'due_date',        width: 13 },
		{ header: 'Base imponible (€)', key: 'tax_base',       width: 14 },
		{ header: 'Importe (€)',        key: 'total_amount',   width: 14 },
		{ header: 'Estado',             key: 'status',         width: 13 },
		{ header: 'Creado',             key: 'created_at',     width: 19 },
	];

	for (const r of rows) {
		sheet.addRow({
			id:             r.id,
			supplier:       r.supplier ?? '—',
			invoice_number: r.invoice_number ?? '—',
			invoice_date:   r.invoice_date ?? '—',
			due_date:       r.due_date ?? '—',
			tax_base:       moneyToNullableNumber(r.tax_base),
			total_amount:   moneyToNullableNumber(r.total_amount),
			status:         REVIEW_STATE_LABELS[r.review_state ?? ''] ?? r.review_state ?? '—',
			created_at:     r.created_at ? r.created_at.toISOString().replace('T', ' ').slice(0, 19) : '—',
		});
	}

	sheet.getColumn('tax_base').numFmt = '#,##0.00';
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

	sheet.autoFilter = { from: 'A1', to: `I${rows.length + 1}` };

	if (truncated) {
		const notice = sheet.addRow({
			id: `Exportación truncada a ${EXPORT_ROW_CAP.toLocaleString(toIntlLocale('es'))} filas — acota el rango de fechas o el proveedor para exportar el resto.`,
		});
		sheet.mergeCells(`A${notice.number}:I${notice.number}`);
		notice.getCell('id').font = { italic: true, bold: true, color: { argb: 'FFB00020' } };
		notice.getCell('id').alignment = { vertical: 'middle' };
	}

	const workbookBuffer = await workbook.xlsx.writeBuffer();
	const excelBuffer: Buffer = workbookBuffer as unknown as Buffer;

	if (format === 'zip') {
		const entries: { name: string; data: Buffer }[] = [{ name: 'facturas.xlsx', data: excelBuffer }];

		for (const r of rows) {
			if (!r.source_file) continue;
			let data: Buffer;
			try {
				data = await getStorage().read(r.source_file);
			} catch {
				continue;
			}
			const ext = path.extname(r.source_file);
			entries.push({ name: `${r.invoice_number || r.id}${ext}`, data });
		}

		const zipBuffer = await buildInvoiceExportZip(entries);

		return new Response(new Uint8Array(zipBuffer), {
			headers: {
				'Content-Type':        'application/zip',
				'Content-Disposition': contentDispositionHeader('attachment', 'facturas.zip'),
			},
		});
	}

	return new Response(workbookBuffer, {
		headers: {
			'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': contentDispositionHeader('attachment', 'invoices.xlsx'),
		},
	});
};
