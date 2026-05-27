import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { suppliers, invoices, invoiceLineItems, pendingProcessedInvoices, pendingLineItems } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

function toFloat(value: FormDataEntryValue | null): number | null {
	if (!value) return null;
	const n = parseFloat(String(value));
	return isNaN(n) ? null : n;
}

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);

	const rows = await db
		.select()
		.from(pendingProcessedInvoices)
		.where(eq(pendingProcessedInvoices.id, id))
		.limit(1);

	const pending = rows[0] ?? null;

	if (!pending || pending.status === 'COMMITTED' || pending.status === 'REJECTED') {
		redirect(303, '/');
	}

	const lineItems = await db
		.select()
		.from(pendingLineItems)
		.where(eq(pendingLineItems.pendingInvoiceId, id));

	let parsedLlm: Record<string, unknown> = {};
	try {
		if (pending.rawLlmJson) {
			parsedLlm = JSON.parse(pending.rawLlmJson) as Record<string, unknown>;
		}
	} catch {
		// rawLlmJson may contain an error string — leave parsedLlm as empty object
	}

	return {
		pending,
		lineItems,
		parsedLlm,
		isManualReview: pending.status === 'MANUAL_REVIEW_REQUIRED',
	};
};

export const actions: Actions = {
	commit: async ({ params, request, locals }) => {
		const id = Number(params.id);
		const formData = await request.formData();

		const supplierName = String(formData.get('supplierName') ?? '').trim();
		const invoiceNumber = String(formData.get('invoiceNumber') ?? '').trim() || null;
		const invoiceDate = String(formData.get('invoiceDate') ?? '').trim() || null;
		const totalAmount = toFloat(formData.get('totalAmount'));

		const rid = locals.restaurantId!;

		if (!supplierName) {
			redirect(303, `/?error=Supplier+name+required`);
		}

		const lineDescriptions = formData.getAll('line_descriptions[]').map(String);
		const lineQuantities = formData.getAll('line_quantities[]').map(String);
		const lineUnits = formData.getAll('line_units[]').map(String);
		const lineUnitPrices = formData.getAll('line_unit_prices[]').map(String);
		const lineTotalPrices = formData.getAll('line_total_prices[]').map(String);

		// Fetch pending record for sourceFile and confidenceScore
		const pendingRows = await db
			.select()
			.from(pendingProcessedInvoices)
			.where(eq(pendingProcessedInvoices.id, id))
			.limit(1);

		const pending = pendingRows[0] ?? null;
		if (!pending) {
			redirect(303, '/');
		}

		// Upsert supplier
		let supplierId: number;
		const existingSupplier = await db
			.select({ id: suppliers.id })
			.from(suppliers)
			.where(and(eq(suppliers.name, supplierName), eq(suppliers.restaurantId, rid)))
			.limit(1);

		if (existingSupplier.length > 0) {
			supplierId = existingSupplier[0].id;
		} else {
			const inserted = await db
				.insert(suppliers)
				.values({ name: supplierName, restaurantId: rid })
				.returning({ id: suppliers.id });
			supplierId = inserted[0].id;
		}

		// Duplicate check
		if (invoiceNumber) {
			const duplicate = await db
				.select({ id: invoices.id })
				.from(invoices)
				.where(and(eq(invoices.supplierId, supplierId), eq(invoices.invoiceNumber, invoiceNumber), eq(invoices.restaurantId, rid)))
				.limit(1);

			if (duplicate.length > 0) {
				redirect(303, `/?duplicate_inv=1`);
			}
		}

		// Insert live invoice
		const insertedInvoice = await db
			.insert(invoices)
			.values({
				restaurantId: rid,
				supplierId,
				invoiceNumber,
				invoiceDate,
				totalAmount,
				status: 'pending',
				sourceFile: pending.originalFilePath,
				confidence: pending.confidenceScore,
			})
			.returning({ id: invoices.id });

		const invoiceId = insertedInvoice[0].id;

		// Insert line items
		const validLines = lineDescriptions
			.map((desc, i) => ({
				description: desc.trim(),
				quantity: toFloat(lineQuantities[i] ?? null),
				unit: lineUnits[i]?.trim() || null,
				unitPrice: toFloat(lineUnitPrices[i] ?? null),
				totalPrice: toFloat(lineTotalPrices[i] ?? null),
			}))
			.filter((item) => item.description !== '');

		if (validLines.length > 0) {
			await db.insert(invoiceLineItems).values(
				validLines.map((item) => ({ invoiceId, restaurantId: rid, ...item }))
			);
		}

		// Mark pending as committed
		await db
			.update(pendingProcessedInvoices)
			.set({ status: 'COMMITTED', committedAt: new Date().toISOString() })
			.where(eq(pendingProcessedInvoices.id, id));

		redirect(303, '/?saved=1');
	},

	reject: async ({ params }) => {
		const id = Number(params.id);

		await db
			.update(pendingProcessedInvoices)
			.set({ status: 'REJECTED' })
			.where(eq(pendingProcessedInvoices.id, id));

		redirect(303, '/');
	},
};
