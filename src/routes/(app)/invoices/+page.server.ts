import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers } from '$lib/server/schema';
import { and, asc, desc, eq, gte, inArray, lte, sql, SQL } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	try {
	const status     = url.searchParams.get('status') ?? '';
	const supplierId = url.searchParams.get('supplier_id') ?? '';
	const dateFrom   = url.searchParams.get('date_from') ?? '';
	const dateTo     = url.searchParams.get('date_to') ?? '';

	const conditions: SQL[] = [];
	if (status)     conditions.push(eq(invoices.status, status));
	if (supplierId) conditions.push(eq(invoices.supplierId, parseInt(supplierId, 10)));
	if (dateFrom)   conditions.push(gte(invoices.invoiceDate, dateFrom));
	if (dateTo)     conditions.push(lte(invoices.invoiceDate, dateTo));

	const invoiceRows = db
		.select({
			id:             invoices.id,
			supplier_name:  suppliers.name,
			invoice_number: invoices.invoiceNumber,
			invoice_date:   invoices.invoiceDate,
			due_date:       invoices.dueDate,
			total_amount:   invoices.totalAmount,
			status:         invoices.status,
			confidence:     invoices.confidence,
			source_file:    invoices.sourceFile,
			created_at:     invoices.createdAt,
			notes:          invoices.notes,
		})
		.from(invoices)
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(invoices.createdAt))
		.all();

	// Fix N+1: fetch all line items in one query, then group in JS
	const invoiceIds = invoiceRows.map((r) => r.id);
	const allLineItems = invoiceIds.length
		? db.select({
			invoice_id:  invoiceLineItems.invoiceId,
			description: invoiceLineItems.description,
			quantity:    invoiceLineItems.quantity,
			unit:        invoiceLineItems.unit,
			unit_price:  invoiceLineItems.unitPrice,
			total_price: invoiceLineItems.totalPrice,
		}).from(invoiceLineItems)
			.where(inArray(invoiceLineItems.invoiceId, invoiceIds))
			.all()
		: [];

	const lineItemsByInvoice = new Map<number, typeof allLineItems>();
	for (const li of allLineItems) {
		if (li.invoice_id == null) continue;
		const arr = lineItemsByInvoice.get(li.invoice_id) ?? [];
		arr.push(li);
		lineItemsByInvoice.set(li.invoice_id, arr);
	}

	const invoiceList = invoiceRows.map((inv) => ({
		...inv,
		line_items: lineItemsByInvoice.get(inv.id) ?? [],
	}));

	// Stats (global, not filtered)
	const today = new Date().toISOString().split('T')[0];
	type StatsRow = { pending_amount: number; pending_count: number; overdue_count: number; paid_count: number };
	const stats = db.get<StatsRow>(sql`
		SELECT
			COALESCE(SUM(CASE WHEN status = 'pending' THEN COALESCE(total_amount, 0) ELSE 0 END), 0) AS pending_amount,
			COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
			COUNT(CASE WHEN status = 'pending' AND due_date < ${today} AND due_date IS NOT NULL THEN 1 END) AS overdue_count,
			COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count
		FROM ${invoices}
	`) ?? { pending_amount: 0, pending_count: 0, overdue_count: 0, paid_count: 0 };

	const supplierCountRow = db.select({ cnt: sql<number>`COUNT(*)` }).from(suppliers).get();
	const supplierCount = supplierCountRow?.cnt ?? 0;

	// Suppliers for filter dropdown
	const supplierRows = conditions.length > 0
		? db.select({ id: suppliers.id, name: suppliers.name })
			.from(suppliers)
			.innerJoin(invoices, eq(invoices.supplierId, suppliers.id))
			.where(and(...conditions))
			.orderBy(asc(suppliers.name))
			.all()
		: db.select({ id: suppliers.id, name: suppliers.name })
			.from(suppliers)
			.orderBy(asc(suppliers.name))
			.all();

	return {
		title: 'Invoices',
		invoices: invoiceList,
		stats: { ...stats, supplier_count: supplierCount },
		suppliers: supplierRows,
		filters: { status, supplier_id: supplierId, date_from: dateFrom, date_to: dateTo },
	};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[invoices] load failed', e);
		error(500, 'Failed to load invoices');
	}
};

export const actions: Actions = {
	markPaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, id));
		redirect(303, '/invoices');
	},

	markUnpaid: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.update(invoices).set({ status: 'pending' }).where(eq(invoices.id, id));
		redirect(303, '/invoices');
	},

	deleteInvoice: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
		await db.delete(invoices).where(eq(invoices.id, id));
		redirect(303, '/invoices');
	},

	bulkPaid: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		if (ids.length > 0) {
			await db.update(invoices).set({ status: 'paid' }).where(inArray(invoices.id, ids));
		}
		redirect(303, '/invoices');
	},

	bulkDelete: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		if (ids.length > 0) {
			await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, ids));
			await db.delete(invoices).where(inArray(invoices.id, ids));
		}
		redirect(303, '/invoices');
	},

	saveNote: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const note = String(data.get('note') ?? '').slice(0, 250) || null;
		await db.update(invoices).set({ notes: note }).where(eq(invoices.id, id));
		return { ok: true };
	},
};
