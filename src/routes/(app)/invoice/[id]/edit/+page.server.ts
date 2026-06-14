import { error, redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers } from '$lib/server/schema';
import { asc, eq, and, ne } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

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
				.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)))
				.limit(1),

			db.select({
				id:          invoiceLineItems.id,
				invoice_id:  invoiceLineItems.invoiceId,
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

		return { title: 'Edit Invoice', invoice: row, lineItems };
	} catch (e) {
		if (e && typeof e === 'object' && ('status' in e || 'location' in e)) throw e;
		console.error('[invoice/edit] load failed', e);
		error(500, 'Failed to load invoice');
	}
};

function toFloat(value: FormDataEntryValue | null): number | null {
	if (!value) return null;
	const n = parseFloat(String(value));
	return isNaN(n) ? null : n;
}

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const id  = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const supplierName  = String(data.get('supplier_name') ?? '').trim();
		const invoiceNumber = String(data.get('invoice_number') ?? '').trim() || null;
		const invoiceDate   = String(data.get('invoice_date') ?? '').trim() || null;
		const dueDate       = String(data.get('due_date') ?? '').trim() || null;
		const totalAmount   = toFloat(data.get('total_amount'));
		const notes         = String(data.get('notes') ?? '').slice(0, 250) || null;

		const lineDescriptions = data.getAll('line_descriptions').map(String);
		const lineQuantities   = data.getAll('line_quantities').map(String);
		const lineUnits        = data.getAll('line_units').map(String);
		const lineUnitPrices   = data.getAll('line_unit_prices').map(String);
		const lineTotalPrices  = data.getAll('line_total_prices').map(String);

		let supplierId: number | null = null;
		if (supplierName) {
			const existing = await db.query.suppliers.findFirst({
				where: tdb.scope(suppliers.restaurantId, eq(suppliers.name, supplierName)),
				columns: { id: true },
			});
			if (existing) {
				supplierId = existing.id;
			} else {
				const inserted = await db.insert(suppliers)
					.values({ name: supplierName, restaurantId: rid })
					.returning({ id: suppliers.id });
				supplierId = inserted[0].id;
			}
		}

		if (supplierId && invoiceNumber) {
			const duplicate = await db
				.select({ id: invoices.id })
				.from(invoices)
				.where(and(
					tdb.scope(invoices.restaurantId),
					eq(invoices.supplierId, supplierId),
					eq(invoices.invoiceNumber, invoiceNumber),
					ne(invoices.id, id),
				))
				.limit(1);
			if (duplicate.length > 0) {
				return fail(409, { error: 'Invoice number already exists for this supplier.' });
			}
		}

		await db.update(invoices)
			.set({ supplierId, invoiceNumber, invoiceDate, dueDate, totalAmount, notes })
			.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)));

		await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

		const newItems = lineDescriptions
			.map((desc, i) => ({
				description: desc,
				quantity:    toFloat(lineQuantities[i] ?? null),
				unit:        lineUnits[i]?.trim() || null,
				unitPrice:   toFloat(lineUnitPrices[i] ?? null),
				totalPrice:  toFloat(lineTotalPrices[i] ?? null),
			}))
			.filter((item) => item.description.trim() !== '');

		if (newItems.length > 0) {
			await db.insert(invoiceLineItems).values(
				newItems.map((item) => ({ invoiceId: id, restaurantId: rid, ...item }))
			);
		}

		redirect(303, '/invoices');
	},
};
