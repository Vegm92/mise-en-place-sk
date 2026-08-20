import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad, Actions } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, systemNotifications } from '$lib/server/schema';
import { asc, eq, and, isNull } from 'drizzle-orm';
import { moneyToNullableNumber } from '$lib/server/money';

export const load: PageServerLoad = async ({ params, locals }) => {
	return handleLoad('invoice/detail', async () => {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

		const [rows, lineItems] = await Promise.all([
			db.select({
				id:             invoices.id,
				supplier_id:    invoices.supplierId,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				document_type:  invoices.documentType,
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
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, id), isNull(invoices.deletedAt)))
				.limit(1),

			db.select({
				id:          invoiceLineItems.id,
				description: invoiceLineItems.description,
				quantity:    invoiceLineItems.quantity,
				unit:        invoiceLineItems.unit,
				unit_price:  invoiceLineItems.unitPrice,
				total_price: invoiceLineItems.totalPrice,
				tax_rate:    invoiceLineItems.taxRate,
			})
				.from(invoiceLineItems)
				.where(tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, id)))
				.orderBy(asc(invoiceLineItems.id)),
		]);

		const row = rows[0];
		if (!row) redirect(303, '/invoices');

		return {
			title: `Invoice ${row.invoice_number ?? row.id}`,
			invoice: { ...row, total_amount: moneyToNullableNumber(row.total_amount) },
			lineItems: lineItems.map(li => ({
				...li,
				unit_price: moneyToNullableNumber(li.unit_price),
				total_price: moneyToNullableNumber(li.total_price),
			})),
		};
	});
};

export const actions: Actions = {
	delete: async ({ params, locals }) => {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const uid = locals.user!.id;

		const [inv] = await db.select()
			.from(invoices)
			.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, id), isNull(invoices.deletedAt)));
		if (!inv) redirect(303, '/invoices');

		await db.update(invoices).set({ deletedAt: new Date() })
			.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)));
		await db.insert(invoiceAuditLog).values({
			restaurantId: rid,
			invoiceId:    id,
			action:       'soft_delete',
			userId:       uid,
			snapshot:     JSON.stringify(inv),
		});
		redirect(303, '/invoices');
	},
};
