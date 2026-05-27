import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { suppliers, invoices, supplierMetrics } from '$lib/server/schema';
import { eq, desc, and } from 'drizzle-orm';
import { VALID_CATEGORIES } from '$lib/constants';
import { computeAndCacheReliabilityScore } from '$lib/server/supplier-reliability';

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = Number(params.id);
	if (!id || isNaN(id)) error(404, 'Supplier not found');

	const rid = locals.restaurantId!;

	const [supplierRows, supplierInvoices, metricsRows] = await Promise.all([
		db.select().from(suppliers)
			.where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, rid)))
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
			.where(and(eq(invoices.supplierId, id), eq(invoices.restaurantId, rid)))
			.orderBy(desc(invoices.invoiceDate)),

		db.select().from(supplierMetrics)
			.where(and(eq(supplierMetrics.supplierId, id), eq(supplierMetrics.restaurantId, rid)))
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
		const data = await request.formData();

		const name         = String(data.get('name') ?? '').trim();
		const category     = String(data.get('category') ?? '');
		const contactEmail = String(data.get('contact_email') ?? '').trim() || null;
		const notes        = String(data.get('notes') ?? '').trim() || null;

		if (!name) error(400, 'Name is required');

		const cat = VALID_CATEGORIES.includes(category) ? category : null;

		await db.update(suppliers)
			.set({ name, category: cat, contactEmail, notes })
			.where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, rid)));

		redirect(303, `/suppliers/${id}`);
	},

	delete: async ({ params, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;

		await db.update(invoices).set({ supplierId: null })
			.where(and(eq(invoices.supplierId, id), eq(invoices.restaurantId, rid)));
		await db.delete(supplierMetrics)
			.where(and(eq(supplierMetrics.supplierId, id), eq(supplierMetrics.restaurantId, rid)));
		await db.delete(suppliers)
			.where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, rid)));

		redirect(303, '/suppliers');
	},
};
