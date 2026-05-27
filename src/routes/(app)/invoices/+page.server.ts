import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers, systemNotifications } from '$lib/server/schema';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	try {
		const status     = url.searchParams.get('status') ?? '';
		const supplierId = url.searchParams.get('supplier_id') ?? '';
		const dateFrom   = url.searchParams.get('date_from') ?? '';
		const dateTo     = url.searchParams.get('date_to') ?? '';

		const conditions: SQL[] = [eq(invoices.restaurantId, rid)];
		if (status)     conditions.push(eq(invoices.status, status));
		if (supplierId) conditions.push(eq(invoices.supplierId, parseInt(supplierId, 10)));
		if (dateFrom)   conditions.push(gte(invoices.invoiceDate, dateFrom));
		if (dateTo)     conditions.push(lte(invoices.invoiceDate, dateTo));

		const [invoiceRows, statsRow, supplierCountRow, supplierRows] = await Promise.all([
			db.select({
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
				.where(and(...conditions))
				.orderBy(desc(invoices.createdAt)),

			db.select({
				pending_amount: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status}='pending' THEN COALESCE(${invoices.totalAmount},0) ELSE 0 END),0)`,
				pending_count:  sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' THEN 1 END)`,
				overdue_count:  sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' AND ${invoices.dueDate} < CURRENT_DATE::text AND ${invoices.dueDate} IS NOT NULL THEN 1 END)`,
				paid_count:     sql<number>`COUNT(CASE WHEN ${invoices.status}='paid' THEN 1 END)`,
			})
				.from(invoices)
				.where(eq(invoices.restaurantId, rid)),

			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(suppliers)
				.where(eq(suppliers.restaurantId, rid)),

			db.select({ id: suppliers.id, name: suppliers.name })
				.from(suppliers)
				.where(eq(suppliers.restaurantId, rid))
				.orderBy(asc(suppliers.name)),
		]);

		// Fetch all line items in one query
		const invoiceIds = invoiceRows.map(r => r.id);
		const allLineItems = invoiceIds.length
			? await db.select({
				invoice_id:  invoiceLineItems.invoiceId,
				description: invoiceLineItems.description,
				quantity:    invoiceLineItems.quantity,
				unit:        invoiceLineItems.unit,
				unit_price:  invoiceLineItems.unitPrice,
				total_price: invoiceLineItems.totalPrice,
			}).from(invoiceLineItems)
				.where(inArray(invoiceLineItems.invoiceId, invoiceIds))
			: [];

		const lineItemsByInvoice = new Map<number, typeof allLineItems>();
		for (const li of allLineItems) {
			if (li.invoice_id == null) continue;
			const arr = lineItemsByInvoice.get(li.invoice_id) ?? [];
			arr.push(li);
			lineItemsByInvoice.set(li.invoice_id, arr);
		}

		const invoiceList = invoiceRows.map(inv => ({
			...inv,
			line_items: lineItemsByInvoice.get(inv.id) ?? [],
		}));

		const stats = statsRow[0] ?? { pending_amount: 0, pending_count: 0, overdue_count: 0, paid_count: 0 };

		return {
			title: 'Invoices',
			invoices: invoiceList,
			stats: { ...stats, supplier_count: supplierCountRow[0]?.cnt ?? 0 },
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
	markPaid: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.update(invoices).set({ status: 'paid' })
			.where(and(eq(invoices.id, id), eq(invoices.restaurantId, locals.restaurantId!)));
		redirect(303, '/invoices');
	},
	markUnpaid: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		await db.update(invoices).set({ status: 'pending' })
			.where(and(eq(invoices.id, id), eq(invoices.restaurantId, locals.restaurantId!)));
		redirect(303, '/invoices');
	},
	deleteInvoice: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const rid = locals.restaurantId!;
		// Verify ownership before delete
		const [inv] = await db.select({ id: invoices.id })
			.from(invoices)
			.where(and(eq(invoices.id, id), eq(invoices.restaurantId, rid)));
		if (!inv) redirect(303, '/invoices');
		await db.delete(systemNotifications).where(eq(systemNotifications.invoiceId, id));
		await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
		await db.delete(invoices).where(eq(invoices.id, id));
		redirect(303, '/invoices');
	},
	bulkPaid: async ({ request, locals }) => {
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		if (ids.length > 0) {
			await db.update(invoices).set({ status: 'paid' })
				.where(and(inArray(invoices.id, ids), eq(invoices.restaurantId, locals.restaurantId!)));
		}
		redirect(303, '/invoices');
	},
	bulkDelete: async ({ request, locals }) => {
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		const rid = locals.restaurantId!;
		if (ids.length > 0) {
			// Verify all IDs belong to this restaurant
			const owned = await db.select({ id: invoices.id })
				.from(invoices)
				.where(and(inArray(invoices.id, ids), eq(invoices.restaurantId, rid)));
			const ownedIds = owned.map(o => o.id);
			if (ownedIds.length > 0) {
				await db.delete(systemNotifications).where(inArray(systemNotifications.invoiceId, ownedIds));
				await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, ownedIds));
				await db.delete(invoices).where(inArray(invoices.id, ownedIds));
			}
		}
		redirect(303, '/invoices');
	},
	saveNote: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const note = String(data.get('note') ?? '').slice(0, 250) || null;
		await db.update(invoices).set({ notes: note })
			.where(and(eq(invoices.id, id), eq(invoices.restaurantId, locals.restaurantId!)));
		return { ok: true };
	},
};
