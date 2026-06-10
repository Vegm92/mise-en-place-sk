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

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = Number(params.id);
	const rid = locals.restaurantId;
	if (!rid) redirect(303, '/login');

	const rows = await db
		.select()
		.from(pendingProcessedInvoices)
		.where(and(eq(pendingProcessedInvoices.id, id), eq(pendingProcessedInvoices.restaurantId, rid)))
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

		let isDuplicate = false;
		let notFound = false;

		await db.transaction(async (tx) => {
			// Fetch pending record scoped to this restaurant
			const pendingRows = await tx
				.select()
				.from(pendingProcessedInvoices)
				.where(and(eq(pendingProcessedInvoices.id, id), eq(pendingProcessedInvoices.restaurantId, rid)))
				.limit(1);

			const pending = pendingRows[0] ?? null;
			if (!pending) {
				notFound = true;
				return;
			}

			// Upsert supplier
			let supplierId: number;
			const existingSupplier = await tx
				.select({ id: suppliers.id })
				.from(suppliers)
				.where(and(eq(suppliers.name, supplierName), eq(suppliers.restaurantId, rid)))
				.limit(1);

			if (existingSupplier.length > 0) {
				supplierId = existingSupplier[0].id;
			} else {
				const inserted = await tx
					.insert(suppliers)
					.values({ name: supplierName, restaurantId: rid })
					.returning({ id: suppliers.id });
				supplierId = inserted[0].id;
			}

			// Insert live invoice — onConflictDoNothing guards against concurrent duplicate inserts
			const insertedInvoice = await tx
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
				.onConflictDoNothing()
				.returning({ id: invoices.id });

			if (!insertedInvoice.length) {
				isDuplicate = true;
				return;
			}

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
				await tx.insert(invoiceLineItems).values(
					validLines.map((item) => ({ invoiceId, restaurantId: rid, ...item }))
				);
			}

			// Mark pending as committed
			await tx
				.update(pendingProcessedInvoices)
				.set({ status: 'COMMITTED', committedAt: new Date().toISOString() })
				.where(and(eq(pendingProcessedInvoices.id, id), eq(pendingProcessedInvoices.restaurantId, rid)));
		});

		if (notFound) redirect(303, '/');
		if (isDuplicate) redirect(303, '/?duplicate_inv=1');
		redirect(303, '/?saved=1');
	},

	reject: async ({ params, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;

		await db
			.update(pendingProcessedInvoices)
			.set({ status: 'REJECTED' })
			.where(and(eq(pendingProcessedInvoices.id, id), eq(pendingProcessedInvoices.restaurantId, rid)));

		redirect(303, '/');
	},
};
