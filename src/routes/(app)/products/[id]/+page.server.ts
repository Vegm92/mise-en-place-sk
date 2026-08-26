import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { products, invoiceLineItems, invoices, suppliers, productAliases } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { VALID_CATEGORIES } from '$lib/constants';
import { checkRateLimit } from '$lib/server/rate-limiter';
import {
	getLinkedSuppliers, unlinkSupplier as unlinkSupplierFromProduct,
	deleteProduct, resolveUnitConversionAlerts,
} from '$lib/server/products';
import { moneyToNullableNumber } from '$lib/server/money';
import { EU_ALLERGENS, parseDecimal, toAllergenList } from '$lib/recipes';

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = Number(params.id);
	if (!id || isNaN(id)) error(404, 'Product not found');

	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);

	const [productRows] = await Promise.all([
		db.select().from(products).where(tdb.scope(products.restaurantId, eq(products.id, id))).limit(1),
	]);
	const product = productRows[0];
	if (!product) error(404, 'Product not found');

	const [linkedSuppliers, aliases, priceHistory] = await Promise.all([
		getLinkedSuppliers(db, rid, id),

		db.select({
			id:          productAliases.id,
			rawText:     productAliases.rawText,
			supplierSku: productAliases.supplierSku,
			source:      productAliases.source,
			confirmedAt: productAliases.confirmedAt,
			createdAt:   productAliases.createdAt,
			supplierName: suppliers.name,
		})
			.from(productAliases)
			.leftJoin(suppliers, eq(suppliers.id, productAliases.supplierId))
			.where(tdb.scope(productAliases.restaurantId, eq(productAliases.productId, id)))
			.orderBy(desc(productAliases.createdAt)),

		db.select({
			unitPrice:           invoiceLineItems.unitPrice,
			normalizedUnitPrice: invoiceLineItems.normalizedUnitPrice,
			quantity:            invoiceLineItems.quantity,
			unit:                invoiceLineItems.unit,
			invoiceDate:         invoices.invoiceDate,
			supplierName:        suppliers.name,
		})
			.from(invoiceLineItems)
			.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.productId, id)))
			.orderBy(desc(invoices.invoiceDate))
			.limit(50),
	]);

	return {
		title: 'prod.detail.pageTitle',
		product,
		linkedSuppliers,
		aliases,
		priceHistory: priceHistory.map(p => ({
			...p,
			unitPrice: moneyToNullableNumber(p.unitPrice),
			normalizedUnitPrice: moneyToNullableNumber(p.normalizedUnitPrice),
		})),
		categories: VALID_CATEGORIES,
		allergens: EU_ALLERGENS,
	};
};

export const actions: Actions = {
	saveFacts: async ({ params, request, locals }) => {
		const id = Number(params.id);
		if (!Number.isInteger(id)) return fail(422, { error: 'prod.facts.err' });
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const macro = (key: string) => {
			const raw = String(data.get(key) ?? '').trim();
			return raw === '' ? null : parseDecimal(raw, 2);
		};
		const kcal100 = macro('kcal100');
		const protein100 = macro('protein100');
		const carbs100 = macro('carbs100');
		const fat100 = macro('fat100');
		const hasNutrition = [kcal100, protein100, carbs100, fat100].some((v) => v !== null);

		await db.update(products).set({
			allergens: toAllergenList(data.getAll('allergens').map(String)),
			allergensSource: 'manual',
			kcal100,
			protein100,
			carbs100,
			fat100,
			nutritionSource: hasNutrition ? 'manual' : null,
		}).where(tdb.scope(products.restaurantId, eq(products.id, id)));

		redirect(303, `/products/${id}`);
	},

	update: async ({ params, request, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const data = await request.formData();

		const canonicalName = String(data.get('canonicalName') ?? '').trim();
		const category      = String(data.get('category') ?? '').trim() || null;
		const canonicalUnit = String(data.get('canonicalUnit') ?? '').trim() || null;
		const unitsPerPackRaw = String(data.get('unitsPerPack') ?? '').trim();
		const baseUnit      = String(data.get('baseUnit') ?? '').trim() || null;

		if (!canonicalName) return fail(422, { error: 'El nombre del producto es obligatorio' });

		const unitsPerPack = unitsPerPackRaw ? parseFloat(unitsPerPackRaw) : null;
		if (unitsPerPackRaw && (isNaN(unitsPerPack!) || unitsPerPack! <= 0)) {
			return fail(422, { error: 'Unidades por pack debe ser un número positivo' });
		}

		const cat = category && VALID_CATEGORIES.includes(category) ? category : null;

		await db.update(products)
			.set({ canonicalName, category: cat, canonicalUnit, unitsPerPack, baseUnit })
			.where(tdb.scope(products.restaurantId, eq(products.id, id)));

		if (unitsPerPack != null && baseUnit) {
			await resolveUnitConversionAlerts(db, rid, id);
		}

		redirect(303, `/products/${id}`);
	},

	unlinkSupplier: async ({ params, request, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;
		const data = await request.formData();
		const supplierId = Number(data.get('supplierId'));
		if (!supplierId || isNaN(supplierId)) return fail(422, { error: 'Invalid supplier' });

		if (!(await checkRateLimit(`product-unlink:${rid}`, 30))) return fail(429, { error: 'Too many requests' });

		await unlinkSupplierFromProduct(db, rid, id, supplierId);

		redirect(303, `/products/${id}`);
	},

	delete: async ({ params, locals }) => {
		const id = Number(params.id);
		const rid = locals.restaurantId!;
		if (!(await checkRateLimit(`product-delete:${rid}`, 20))) return fail(429, { error: 'Too many requests' });

		const result = await deleteProduct(db, rid, id);
		if (!result.ok) {
			if (result.reason === 'not_found') error(404, 'Product not found');
			return fail(409, {
				error: 'Este producto sigue vinculado a proveedores. Desvincúlalo primero.',
				suppliers: result.suppliers,
			});
		}

		redirect(303, '/products');
	},
};
