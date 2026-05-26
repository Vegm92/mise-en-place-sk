import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { suppliers, invoices, supplierMetrics } from '$lib/server/schema';
import { sql, eq, desc } from 'drizzle-orm';
import { VALID_CATEGORIES } from '$lib/constants';
import { computeAndCacheReliabilityScore } from '$lib/server/supplier-reliability';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (!id || isNaN(id)) error(404, 'Supplier not found');

	const supplier = db.select().from(suppliers).where(eq(suppliers.id, id)).get();
	if (!supplier) error(404, 'Supplier not found');

	// Load invoices for this supplier
	const supplierInvoices = db
		.select({
			id: invoices.id,
			invoiceNumber: invoices.invoiceNumber,
			invoiceDate: invoices.invoiceDate,
			dueDate: invoices.dueDate,
			totalAmount: invoices.totalAmount,
			status: invoices.status,
		})
		.from(invoices)
		.where(eq(invoices.supplierId, id))
		.orderBy(desc(invoices.invoiceDate))
		.all();

	// Load or compute metrics
	const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	let metrics = db.select().from(supplierMetrics).where(eq(supplierMetrics.supplierId, id)).get();

	if (supplierInvoices.length >= 3) {
		if (!metrics || (metrics.computedAt ?? '') < yesterday) {
			const fresh = computeAndCacheReliabilityScore(id);
			metrics = { id: metrics?.id ?? 0, supplierId: id, ...fresh };
		}
	}

	return {
		supplier,
		invoices: supplierInvoices,
		metrics: supplierInvoices.length >= 3 ? metrics ?? null : null,
		categories: VALID_CATEGORIES,
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const id = Number(params.id);
		const data = await request.formData();

		const name = String(data.get('name') ?? '').trim();
		const category = String(data.get('category') ?? '');
		const contactEmail = String(data.get('contact_email') ?? '').trim() || null;
		const notes = String(data.get('notes') ?? '').trim() || null;

		if (!name) error(400, 'Name is required');

		const cat = VALID_CATEGORIES.includes(category) ? category : null;

		db.update(suppliers)
			.set({ name, category: cat, contactEmail, notes })
			.where(eq(suppliers.id, id))
			.run();

		redirect(303, `/suppliers/${id}`);
	},

	delete: async ({ params }) => {
		const id = Number(params.id);

		// Detach invoices before deleting supplier
		db.update(invoices).set({ supplierId: null }).where(eq(invoices.supplierId, id)).run();
		db.delete(supplierMetrics).where(eq(supplierMetrics.supplierId, id)).run();
		db.delete(suppliers).where(eq(suppliers.id, id)).run();

		redirect(303, '/suppliers');
	},
};
