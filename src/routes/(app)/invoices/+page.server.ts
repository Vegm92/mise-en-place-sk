import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, systemNotifications } from '$lib/server/schema';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	try {
		const status     = url.searchParams.get('status') ?? '';
		const supplierId = url.searchParams.get('supplier_id') ?? '';
		const dateFrom   = url.searchParams.get('date_from') ?? '';
		const dateTo     = url.searchParams.get('date_to') ?? '';
		const page       = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
		const offset     = (page - 1) * PAGE_SIZE;

		const conditions: SQL[] = [eq(invoices.restaurantId, rid), isNull(invoices.deletedAt)];
		if (status)     conditions.push(eq(invoices.status, status));
		if (supplierId) conditions.push(eq(invoices.supplierId, parseInt(supplierId, 10)));
		if (dateFrom)   conditions.push(gte(invoices.invoiceDate, dateFrom));
		if (dateTo)     conditions.push(lte(invoices.invoiceDate, dateTo));

		const [invoiceRows, statsRow, supplierCountRow, supplierRows, countRow] = await Promise.all([
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
				.orderBy(desc(invoices.createdAt))
				.limit(PAGE_SIZE)
				.offset(offset),

			db.select({
				pending_amount: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status}='pending' THEN COALESCE(${invoices.totalAmount},0) ELSE 0 END),0)`,
				pending_count:  sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' THEN 1 END)`,
				overdue_count:  sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' AND ${invoices.dueDate} < CURRENT_DATE::text AND ${invoices.dueDate} IS NOT NULL THEN 1 END)`,
				paid_count:     sql<number>`COUNT(CASE WHEN ${invoices.status}='paid' THEN 1 END)`,
			})
				.from(invoices)
				.where(and(eq(invoices.restaurantId, rid), isNull(invoices.deletedAt))),

			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(suppliers)
				.where(eq(suppliers.restaurantId, rid)),

			db.select({ id: suppliers.id, name: suppliers.name })
				.from(suppliers)
				.where(eq(suppliers.restaurantId, rid))
				.orderBy(asc(suppliers.name)),

			db.select({ cnt: count() })
				.from(invoices)
				.where(and(...conditions)),
		]);

		// Line items only for the current page
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
		const total = Number(countRow[0]?.cnt ?? 0);

		return {
			title: 'Invoices',
			invoices: invoiceList,
			stats: { ...stats, supplier_count: supplierCountRow[0]?.cnt ?? 0 },
			suppliers: supplierRows,
			filters: { status, supplier_id: supplierId, date_from: dateFrom, date_to: dateTo },
			pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
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
		const uid = locals.user!.id;
		const [inv] = await db.select()
			.from(invoices)
			.where(and(eq(invoices.id, id), eq(invoices.restaurantId, rid), isNull(invoices.deletedAt)));
		if (!inv) redirect(303, '/invoices');
		const now = new Date();
		await db.update(invoices).set({ deletedAt: now })
			.where(and(eq(invoices.id, id), eq(invoices.restaurantId, rid)));
		await db.insert(invoiceAuditLog).values({
			restaurantId: rid,
			invoiceId:    id,
			action:       'soft_delete',
			userId:       uid,
			snapshot:     JSON.stringify(inv),
		});
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
		const uid = locals.user!.id;
		if (ids.length > 0) {
			const owned = await db.select()
				.from(invoices)
				.where(and(inArray(invoices.id, ids), eq(invoices.restaurantId, rid), isNull(invoices.deletedAt)));
			if (owned.length > 0) {
				const now = new Date();
				const ownedIds = owned.map(o => o.id);
				await db.update(invoices).set({ deletedAt: now })
					.where(and(inArray(invoices.id, ownedIds), eq(invoices.restaurantId, rid)));
				await db.insert(invoiceAuditLog).values(
					owned.map(inv => ({
						restaurantId: rid,
						invoiceId:    inv.id,
						action:       'soft_delete' as const,
						userId:       uid,
						snapshot:     JSON.stringify(inv),
					}))
				);
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
