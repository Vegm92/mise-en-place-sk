import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers, systemNotifications } from '$lib/server/schema';
import { asc, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const id = Number(params.id);

		const row = db
			.select({
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
			.where(eq(invoices.id, id))
			.get();

		if (!row) redirect(303, '/invoices');

		const lineItems = db
			.select({
				id:          invoiceLineItems.id,
				description: invoiceLineItems.description,
				quantity:    invoiceLineItems.quantity,
				unit:        invoiceLineItems.unit,
				unit_price:  invoiceLineItems.unitPrice,
				total_price: invoiceLineItems.totalPrice,
			})
			.from(invoiceLineItems)
			.where(eq(invoiceLineItems.invoiceId, id))
			.orderBy(asc(invoiceLineItems.id))
			.all();

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
	delete: async ({ params }) => {
		const id = Number(params.id);
		await db.delete(systemNotifications).where(eq(systemNotifications.invoiceId, id));
		await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
		await db.delete(invoices).where(eq(invoices.id, id));
		redirect(303, '/invoices');
	},
};
