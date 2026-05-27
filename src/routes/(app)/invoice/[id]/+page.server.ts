import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers, systemNotifications } from '$lib/server/schema';
import { asc, eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;

		const [rows, lineItems] = await Promise.all([
			db.select({
				id:             invoices.id,
				supplier_id:    invoices.supplierId,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				invoice_date:   invoices.invoiceDate,
				due_date:       invoices.dueDate,
				total_amount:   invoices.totalAmount,
				status:         invoices.status,
				source_file:    invoices.sourceFile,
				notes:          invoices.notes,
				created_at:     invoices.createdAt,
			})
				.from(invoices)
				.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
				.where(and(eq(invoices.id, id), eq(invoices.restaurantId, rid)))
				.limit(1),

			db.select({
				id:          invoiceLineItems.id,
				description: invoiceLineItems.description,
				quantity:    invoiceLineItems.quantity,
				unit:        invoiceLineItems.unit,
				unit_price:  invoiceLineItems.unitPrice,
				total_price: invoiceLineItems.totalPrice,
			})
				.from(invoiceLineItems)
				.where(eq(invoiceLineItems.invoiceId, id))
				.orderBy(asc(invoiceLineItems.id)),
		]);

		const row = rows[0];
		if (!row) redirect(303, '/invoices');

		return {
			title: `Invoice ${row.invoice_number ?? row.id}`,
			invoice: row,
			lineItems,
		};
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[invoice/detail] load failed', e);
		error(500, 'Failed to load invoice');
	}
};

export const actions: Actions = {
	delete: async ({ params, locals }) => {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;

		await db.delete(systemNotifications).where(eq(systemNotifications.invoiceId, id));
		await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
		await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.restaurantId, rid)));
		redirect(303, '/invoices');
	},
};
