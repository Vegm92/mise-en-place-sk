import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, systemNotifications } from '$lib/server/schema';
import { trackEvent } from '$lib/server/events';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { markInvoicePaid, markInvoiceUnpaid, markInvoicesPaidBulk } from '$lib/server/invoice-status';
import { checkRateLimit } from '$lib/server/rate-limiter';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('invoices', async () => {
		// Set by the batch save action after the last invoice of a batch lands
		// (issue #235) — replaces the /save-confirmation interstitial.
		const savedId = parseInt(url.searchParams.get('saved') ?? '', 10);
		const status     = url.searchParams.get('status') ?? '';
		const supplierId = url.searchParams.get('supplier_id') ?? '';
		const dateFrom   = url.searchParams.get('date_from') ?? '';
		const dateTo     = url.searchParams.get('date_to') ?? '';
		const page       = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
		const offset     = (page - 1) * PAGE_SIZE;

		const conditions: SQL[] = [tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)];
		if (status)     conditions.push(eq(invoices.status, status));
		if (supplierId) conditions.push(eq(invoices.supplierId, parseInt(supplierId, 10)));
		if (dateFrom)   conditions.push(gte(invoices.invoiceDate, dateFrom));
		if (dateTo)     conditions.push(lte(invoices.invoiceDate, dateTo));

		const [invoiceRows, statsRow, supplierCountRow, supplierRows, countRow] = await Promise.all([
			db.select({
				id:             invoices.id,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				invoice_date:   invoices.invoiceDate,
				due_date:       invoices.dueDate,
				total_amount:   invoices.totalAmount,
				status:         invoices.status,
				confidence:     invoices.confidence,
				source_file:    invoices.sourceFile,
				created_at:     invoices.createdAt,
				notes:          invoices.notes,
			})
				.from(invoices)
				.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
				.where(and(...conditions))
				.orderBy(desc(invoices.createdAt))
				.limit(PAGE_SIZE)
				.offset(offset),

			db.select({
				pending_amount: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status}='pending' THEN COALESCE(${invoices.totalAmount},0) ELSE 0 END),0)`,
				pending_count:  sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' THEN 1 END)`,
				overdue_count:  sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' AND ${invoices.dueDate} < CURRENT_DATE::text AND ${invoices.dueDate} IS NOT NULL THEN 1 END)`,
				paid_count:     sql<number>`COUNT(CASE WHEN ${invoices.status}='paid' THEN 1 END)`,
			})
				.from(invoices)
				.where(tdb.scope(invoices.restaurantId, isNull(invoices.deletedAt))),

			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(suppliers)
				.where(tdb.scope(suppliers.restaurantId)),

			db.select({ id: suppliers.id, name: suppliers.name })
				.from(suppliers)
				.where(tdb.scope(suppliers.restaurantId))
				.orderBy(asc(suppliers.name)),

			db.select({ cnt: count() })
				.from(invoices)
				.where(and(...conditions)),
		]);

		// Alerts raised while saving that invoice ride along on the toast instead
		// of needing their own page.
		const savedAlerts = Number.isFinite(savedId)
			? (await db.select({ message: systemNotifications.message })
				.from(systemNotifications)
				.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.invoiceId, savedId))))
				.map(r => r.message)
			: [];

		// Line items only for the current page
		const invoiceIds = invoiceRows.map(r => r.id);
		const allLineItems = invoiceIds.length
			? await db.select({
				invoice_id:  invoiceLineItems.invoiceId,
				description: invoiceLineItems.description,
				quantity:    invoiceLineItems.quantity,
				unit:        invoiceLineItems.unit,
				unit_price:  invoiceLineItems.unitPrice,
				total_price: invoiceLineItems.totalPrice,
			}).from(invoiceLineItems)
				.where(inArray(invoiceLineItems.invoiceId, invoiceIds))
			: [];

		const lineItemsByInvoice = new Map<number, typeof allLineItems>();
		for (const li of allLineItems) {
			if (li.invoice_id == null) continue;
			const arr = lineItemsByInvoice.get(li.invoice_id) ?? [];
			arr.push(li);
			lineItemsByInvoice.set(li.invoice_id, arr);
		}

		const invoiceList = invoiceRows.map(inv => ({
			...inv,
			line_items: lineItemsByInvoice.get(inv.id) ?? [],
		}));

		const stats = statsRow[0] ?? { pending_amount: 0, pending_count: 0, overdue_count: 0, paid_count: 0 };
		const total = Number(countRow[0]?.cnt ?? 0);

		return {
			title: 'inv.title',
			invoices: invoiceList,
			stats: { ...stats, supplier_count: supplierCountRow[0]?.cnt ?? 0 },
			suppliers: supplierRows,
			filters: { status, supplier_id: supplierId, date_from: dateFrom, date_to: dateTo },
			conflict: url.searchParams.get('conflict') === '1',
			savedInvoiceId: Number.isFinite(savedId) ? savedId : null,
			savedAlerts,
			pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
		};
	});
};

export const actions: Actions = {
	// Guarded transitions (issue #243) — a stale tab gets a conflict banner
	// instead of silently overwriting a change made elsewhere.
	markPaid: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const rid = locals.restaurantId!;
		const ok = await markInvoicePaid(id, rid);
		if (ok) trackEvent('invoice_status_changed', rid, { to: 'paid' }, id);
		redirect(303, ok ? '/invoices' : '/invoices?conflict=1');
	},
	markUnpaid: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const rid = locals.restaurantId!;
		const ok = await markInvoiceUnpaid(id, rid);
		if (ok) trackEvent('invoice_status_changed', rid, { to: 'pending' }, id);
		redirect(303, ok ? '/invoices' : '/invoices?conflict=1');
	},
	deleteInvoice: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const uid = locals.user!.id;
		const [inv] = await db.select()
			.from(invoices)
			.where(and(eq(invoices.id, id), tdb.scope(invoices.restaurantId, isNull(invoices.deletedAt))));
		if (!inv) redirect(303, '/invoices');
		const now = new Date();
		await db.update(invoices).set({ deletedAt: now })
			.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)));
		await db.insert(invoiceAuditLog).values({
			restaurantId: rid,
			invoiceId:    id,
			action:       'soft_delete',
			userId:       uid,
			snapshot:     JSON.stringify(inv),
		});
		trackEvent('invoice_status_changed', rid, { to: 'deleted' }, id);
		redirect(303, '/invoices');
	},
	bulkPaid: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		if (!await checkRateLimit(`bulk:${rid}`, 10)) redirect(303, '/invoices');
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		await markInvoicesPaidBulk(ids, rid);
		redirect(303, '/invoices');
	},
	bulkDelete: async ({ request, locals }) => {
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		const rid = locals.restaurantId!;
		if (!await checkRateLimit(`bulk:${rid}`, 10)) redirect(303, '/invoices');
		const tdb = forTenant(rid);
		const uid = locals.user!.id;
		if (ids.length > 0) {
			const owned = await db.select()
				.from(invoices)
				.where(and(inArray(invoices.id, ids), tdb.scope(invoices.restaurantId, isNull(invoices.deletedAt))));
			if (owned.length > 0) {
				const now = new Date();
				const ownedIds = owned.map(o => o.id);
				await db.update(invoices).set({ deletedAt: now })
					.where(and(inArray(invoices.id, ownedIds), tdb.scope(invoices.restaurantId)));
				await db.insert(invoiceAuditLog).values(
					owned.map(inv => ({
						restaurantId: rid,
						invoiceId:    inv.id,
						action:       'soft_delete' as const,
						userId:       uid,
						snapshot:     JSON.stringify(inv),
					}))
				);
			}
		}
		redirect(303, '/invoices');
	},
	saveNote: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const note = String(data.get('note') ?? '').slice(0, 250) || null;
		await db.update(invoices).set({ notes: note })
			.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)));
		return { ok: true };
	},
};
