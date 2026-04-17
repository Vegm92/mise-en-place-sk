import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, dbClient } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);

	const row = dbClient.prepare(`
		SELECT i.*, s.name AS supplier_name
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		WHERE i.id = ?
	`).get(id) as {
		id: number;
		supplier_id: number | null;
		supplier_name: string | null;
		invoice_number: string | null;
		invoice_date: string | null;
		due_date: string | null;
		total_amount: number | null;
		status: string | null;
		source_file: string | null;
		notes: string | null;
		created_at: string | null;
	} | undefined;

	if (!row) {
		redirect(303, '/invoices');
	}

	const lineItems = dbClient.prepare(
		'SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY id'
	).all(id) as {
		id: number;
		invoice_id: number;
		description: string | null;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		total_price: number | null;
	}[];

	return {
		title: 'Edit Invoice',
		invoice: row,
		lineItems,
	};
};

function toFloat(value: FormDataEntryValue | null): number | null {
	if (!value) return null;
	const n = parseFloat(String(value));
	return isNaN(n) ? null : n;
}

export const actions: Actions = {
	save: async ({ request, params }) => {
		const id = Number(params.id);
		const data = await request.formData();

		const supplierName = String(data.get('supplier_name') ?? '').trim();
		const invoiceNumber = String(data.get('invoice_number') ?? '').trim() || null;
		const invoiceDate = String(data.get('invoice_date') ?? '').trim() || null;
		const dueDate = String(data.get('due_date') ?? '').trim() || null;
		const totalAmount = toFloat(data.get('total_amount'));
		const notesRaw = String(data.get('notes') ?? '').slice(0, 250);
		const notes = notesRaw || null;

		const lineDescriptions = data.getAll('line_descriptions').map(String);
		const lineQuantities = data.getAll('line_quantities').map(String);
		const lineUnits = data.getAll('line_units').map(String);
		const lineUnitPrices = data.getAll('line_unit_prices').map(String);
		const lineTotalPrices = data.getAll('line_total_prices').map(String);

		// Upsert supplier
		let supplierId: number | null = null;
		if (supplierName) {
			const existing = await db.query.suppliers.findFirst({
				where: eq(suppliers.name, supplierName),
				columns: { id: true },
			});
			if (existing) {
				supplierId = existing.id;
			} else {
				const inserted = await db.insert(suppliers).values({ name: supplierName }).returning({ id: suppliers.id });
				supplierId = inserted[0].id;
			}
		}

		// Update invoice
		await db.update(invoices)
			.set({ supplierId, invoiceNumber, invoiceDate, dueDate, totalAmount, notes })
			.where(eq(invoices.id, id));

		// Replace line items
		await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

		const newItems = lineDescriptions
			.map((desc, i) => ({
				description: desc,
				quantity: toFloat(lineQuantities[i] ?? null),
				unit: lineUnits[i]?.trim() || null,
				unitPrice: toFloat(lineUnitPrices[i] ?? null),
				totalPrice: toFloat(lineTotalPrices[i] ?? null),
			}))
			.filter((item) => item.description.trim() !== '');

		if (newItems.length > 0) {
			await db.insert(invoiceLineItems).values(
				newItems.map((item) => ({ invoiceId: id, ...item }))
			);
		}

		redirect(303, '/invoices');
	},
};
