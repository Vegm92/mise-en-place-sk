import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { suppliers, invoices, supplierMetrics, unitConversions, invoiceLineItems } from '$lib/server/schema';
import { eq, desc, and, isNull, or, sql } from 'drizzle-orm';
import { VALID_CATEGORIES } from '$lib/constants';
import { computeAndCacheReliabilityScore } from '$lib/server/supplier-reliability';

const VALID_TABS = ['resumen', 'facturas', 'productos', 'conversiones'] as const;
type Tab = typeof VALID_TABS[number];

export const load: PageServerLoad = async ({ params, locals, url }) => {
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

	const [conversions, products] = await Promise.all([
		db.select({
			id:               unitConversions.id,
			ingredient:       unitConversions.ingredient,
			purchaseUnit:     unitConversions.purchaseUnit,
			canonicalUnit:    unitConversions.canonicalUnit,
			conversionFactor: unitConversions.conversionFactor,
		})
			.from(unitConversions)
			.where(and(
				tdb.scope(unitConversions.restaurantId),
				or(
					eq(unitConversions.supplierId, id),
					and(isNull(unitConversions.supplierId), eq(unitConversions.supplierName, supplier.name)),
				),
			))
			.orderBy(unitConversions.ingredient),

		db.select({
			description: invoiceLineItems.description,
			unit:        invoiceLineItems.unit,
			avgPrice:    sql<number>`AVG(${invoiceLineItems.unitPrice})`,
			totalQty:    sql<number>`SUM(${invoiceLineItems.quantity})`,
			lastDate:    sql<string>`MAX(${invoices.invoiceDate})`,
		})
			.from(invoiceLineItems)
			.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
			.where(tdb.scope(invoices.restaurantId, and(
				eq(invoices.supplierId, id),
				isNull(invoices.deletedAt),
			)))
			.groupBy(invoiceLineItems.description, invoiceLineItems.unit)
			.orderBy(sql`MAX(${invoices.invoiceDate}) DESC`),
	]);

	let metrics = metricsRows[0] ?? null;

	if (supplierInvoices.length >= 3) {
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
		if (!metrics || (metrics.computedAt ?? new Date(0)) < yesterday) {
			const fresh = await computeAndCacheReliabilityScore(id, rid);
			metrics = { id: metrics?.id ?? 0, restaurantId: rid, supplierId: id, ...fresh };
		}
	}

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

	const rawTab = url.searchParams.get('tab');
	const initialTab: Tab = VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'resumen';
	const initialIngredient = url.searchParams.get('ingredient') ?? '';
	const initialPurchaseUnit = url.searchParams.get('purchase_unit') ?? '';
	const initialEditing = url.searchParams.get('edit') === '1';

	return {
		supplier,
		invoices: supplierInvoices,
		metrics: supplierInvoices.length >= 3 ? metrics ?? null : null,
		monthly,
		categories: VALID_CATEGORIES,
		conversions,
		products,
		initialTab,
		initialEditing,
		initialIngredient,
		initialPurchaseUnit,
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

		if (cat) {
			await db.execute(sql`
				UPDATE products SET category = ${cat}
				WHERE restaurant_id = ${rid}
				  AND (category IS NULL OR category = 'Other')
				  AND id IN (
				    SELECT DISTINCT product_id FROM product_aliases
				    WHERE restaurant_id = ${rid} AND supplier_id = ${id}
				  )
			`);
		}

		redirect(303, `/suppliers/${id}`);
	},

	addConversion: async ({ params, request, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const ingredient       = String(data.get('ingredient') ?? '').trim();
		const purchaseUnit     = String(data.get('purchase_unit') ?? '').trim();
		const canonicalUnit    = String(data.get('canonical_unit') ?? '').trim();
		const conversionFactor = parseFloat(String(data.get('conversion_factor') ?? ''));

		if (!ingredient || !purchaseUnit || !canonicalUnit || isNaN(conversionFactor) || conversionFactor <= 0) {
			error(400, 'All conversion fields are required and factor must be positive');
		}

		const [supplierRow] = await db.select({ name: suppliers.name })
			.from(suppliers)
			.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, id)))
			.limit(1);
		if (!supplierRow) error(404, 'Supplier not found');

		await db.insert(unitConversions).values({
			restaurantId:     rid,
			supplierId:       id,
			supplierName:     supplierRow.name,
			ingredient,
			purchaseUnit,
			canonicalUnit,
			conversionFactor,
		}).onConflictDoUpdate({
			target: [unitConversions.restaurantId, unitConversions.supplierName, unitConversions.ingredient, unitConversions.purchaseUnit],
			set: { canonicalUnit, conversionFactor, supplierId: id },
		});

		redirect(303, `/suppliers/${id}?tab=conversiones`);
	},

	deleteConversion: async ({ params, request, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();
		const convId = Number(data.get('conversion_id'));
		if (!convId || isNaN(convId)) error(400, 'Invalid conversion id');

		await db.delete(unitConversions)
			.where(and(
				tdb.scope(unitConversions.restaurantId),
				eq(unitConversions.id, convId),
			));

		redirect(303, `/suppliers/${id}?tab=conversiones`);
	},

	delete: async ({ params, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

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
