import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { suppliers, invoices, supplierMetrics } from '$lib/server/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { VALID_CATEGORIES } from '$lib/constants';
import { computeAndCacheReliabilityScore } from '$lib/server/supplier-reliability';

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = Number(params.id);
	if (!id || isNaN(id)) error(404, 'Supplier not found');

	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);

	const [supplierRows, supplierInvoices, metricsRows] = await Promise.all([
		db.select().from(suppliers)
			.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, id)))
			.limit(1),

		db.select({
			id:            invoices.id,
			invoiceNumber: invoices.invoiceNumber,
			invoiceDate:   invoices.invoiceDate,
			dueDate:       invoices.dueDate,
			totalAmount:   invoices.totalAmount,
			status:        invoices.status,
		})
			.from(invoices)
			.where(and(tdb.scope(invoices.restaurantId), eq(invoices.supplierId, id), isNull(invoices.deletedAt)))
			.orderBy(desc(invoices.invoiceDate)),

		db.select().from(supplierMetrics)
			.where(tdb.scope(supplierMetrics.restaurantId, eq(supplierMetrics.supplierId, id)))
			.limit(1),
	]);

	const supplier = supplierRows[0];
	if (!supplier) error(404, 'Supplier not found');

	let metrics = metricsRows[0] ?? null;

	if (supplierInvoices.length >= 3) {
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
		if (!metrics || (metrics.computedAt ?? new Date(0)) < yesterday) {
			const fresh = await computeAndCacheReliabilityScore(id, rid);
			metrics = { id: metrics?.id ?? 0, restaurantId: rid, supplierId: id, ...fresh };
		}
	}

	// Build 7-month spend history for chart
	const monthlyMap: Record<string, number> = {};
	for (const inv of supplierInvoices) {
		if (!inv.invoiceDate) continue;
		const ym = (inv.invoiceDate as string).slice(0, 7);
		monthlyMap[ym] = (monthlyMap[ym] ?? 0) + (inv.totalAmount ?? 0);
	}
	const monthly: { key: string; label: string; value: number; partial: boolean }[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date();
		d.setDate(1);
		d.setMonth(d.getMonth() - i);
		const ym = d.toISOString().slice(0, 7);
		const label = d.toLocaleDateString('es-ES', { month: 'short' });
		monthly.push({ key: ym, label, value: monthlyMap[ym] ?? 0, partial: i === 0 });
	}

	return {
		supplier,
		invoices: supplierInvoices,
		metrics: supplierInvoices.length >= 3 ? metrics ?? null : null,
		monthly,
		categories: VALID_CATEGORIES,
	};
};

export const actions: Actions = {
	update: async ({ params, request, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const name         = String(data.get('name') ?? '').trim();
		const category     = String(data.get('category') ?? '');
		const contactEmail = String(data.get('contact_email') ?? '').trim() || null;
		const contactPhone = String(data.get('contact_phone') ?? '').trim() || null;
		const cif          = String(data.get('cif') ?? '').trim() || null;
		const deliveryDays = String(data.get('delivery_days') ?? '').trim() || null;
		const paymentTermms = String(data.get('payment_terms') ?? '').trim() || null;
		const notes        = String(data.get('notes') ?? '').trim() || null;

		if (!name) error(400, 'Name is required');

		const cat = VALID_CATEGORIES.includes(category) ? category : null;

		await db.update(suppliers)
			.set({ name, category: cat, contactEmail, contactPhone, cif, deliveryDays, paymentTerms: paymentTermms, notes })
			.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, id)));

		redirect(303, `/suppliers/${id}`);
	},

	delete: async ({ params, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

		// One transaction — a crash between statements must not leave invoices
		// detached from a supplier that still exists (issue #247).
		await db.transaction(async (tx) => {
			await tx.update(invoices).set({ supplierId: null })
				.where(tdb.scope(invoices.restaurantId, eq(invoices.supplierId, id)));
			await tx.delete(supplierMetrics)
				.where(tdb.scope(supplierMetrics.restaurantId, eq(supplierMetrics.supplierId, id)));
			await tx.delete(suppliers)
				.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, id)));
		});

		redirect(303, '/suppliers');
	},
};
