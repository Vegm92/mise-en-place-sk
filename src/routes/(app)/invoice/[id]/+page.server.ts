import { fail, redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad, Actions } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers } from '$lib/server/schema';
import { asc, eq, and, isNull } from 'drizzle-orm';
import { moneyToNullableNumber } from '$lib/server/money';
import { linkProductsToInvoice } from '$lib/server/invoice-save';
import { orphanInvoiceAlerts, reevaluateBudgetAlertsForInvoice } from '$lib/server/alerts';
import { parsePack } from '$lib/server/products';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { requirePositiveIntId } from '$lib/server/route-params';

export const load: PageServerLoad = async ({ params, locals }) => {
	return handleLoad('invoice/detail', async () => {
		const id  = requirePositiveIntId(params.id, 'invoice');
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

		const [rows, lineItems] = await Promise.all([
			db.select({
				id:               invoices.id,
				supplier_id:      invoices.supplierId,
				supplier_name:    suppliers.name,
				invoice_number:   invoices.invoiceNumber,
				document_type:    invoices.documentType,
				invoice_date:     invoices.invoiceDate,
				due_date:         invoices.dueDate,
				total_amount:     invoices.totalAmount,
				review_state:     invoices.reviewState,
				source_file:      invoices.sourceFile,
				notes:            invoices.notes,
				created_at:       invoices.createdAt,
				linked_invoice_id: invoices.linkedInvoiceId,
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
				product_id:  invoiceLineItems.productId,
			})
				.from(invoiceLineItems)
				.where(tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, id)))
				.orderBy(asc(invoiceLineItems.id)),
		]);

		const row = rows[0];
		if (!row) redirect(303, '/invoices');

		const linkedInvoice = row.linked_invoice_id
			? (await db.select({
				id:             invoices.id,
				invoice_number: invoices.invoiceNumber,
				document_type:  invoices.documentType,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, row.linked_invoice_id), isNull(invoices.deletedAt)))
				.limit(1))[0] ?? null
			: null;

		return {
			title: 'inv.detail.pageTitle',
			titleParams: { number: row.invoice_number ?? row.id },
			invoice: { ...row, total_amount: moneyToNullableNumber(row.total_amount), linked_invoice: linkedInvoice },
			unlinkedLineCount: lineItems.filter(li => li.product_id == null && (li.description ?? '').trim() !== '').length,
			lineItems: lineItems.map(li => ({
				...li,
				unit_price: moneyToNullableNumber(li.unit_price),
				total_price: moneyToNullableNumber(li.total_price),
			})),
		};
	});
};

export const actions: Actions = {
	relinkProducts: async ({ params, locals }) => {
		const id  = requirePositiveIntId(params.id, 'invoice');
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

		if (!(await rateLimitScoped({ scope: 'tenant', name: 'invoice-relink', max: 20 }, { restaurantId: rid }))) {
			return fail(429, { error: 'Too many requests' });
		}

		const [inv] = await db.select({ supplierId: invoices.supplierId })
			.from(invoices)
			.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, id), isNull(invoices.deletedAt)))
			.limit(1);
		if (!inv?.supplierId) redirect(303, '/invoices');

		const lines = await db.select({
			description:  invoiceLineItems.description,
			unit:         invoiceLineItems.unit,
			supplierSku:  invoiceLineItems.supplierSku,
		})
			.from(invoiceLineItems)
			.where(and(
				tdb.scope(invoiceLineItems.restaurantId),
				eq(invoiceLineItems.invoiceId, id),
				isNull(invoiceLineItems.productId),
			));

		const lineInputs = lines
			.filter(li => (li.description ?? '').trim() !== '')
			.map(li => ({
				desc: li.description!,
				unitVal: li.unit,
				pack: parsePack(li.description, li.unit),
				supplierSku: li.supplierSku,
			}));
		if (lineInputs.length === 0) redirect(303, `/invoice/${id}`);

		await linkProductsToInvoice(id, inv.supplierId, rid, lineInputs);
		redirect(303, `/invoice/${id}`);
	},

	delete: async ({ params, locals }) => {
		const id  = requirePositiveIntId(params.id, 'invoice');
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

		try {
			await orphanInvoiceAlerts(id, rid);
			if (inv.supplierId != null) {
				await reevaluateBudgetAlertsForInvoice(id, inv.supplierId, rid);
			}
		} catch (err) {
			console.error('[invoice/delete] alert cleanup failed (non-fatal):', err);
		}

		redirect(303, '/invoices');
	},
};
