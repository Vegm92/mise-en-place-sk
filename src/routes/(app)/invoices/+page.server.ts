import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { periodRange } from '$lib/server/period-range';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, systemNotifications } from '$lib/server/schema';
import { trackEvent } from '$lib/server/events';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { invoiceReviewFilter, markInvoiceReviewed, markInvoicesReviewedBulk } from '$lib/server/invoice-status';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { moneyToNullableNumber } from '$lib/server/money';
import {
	countActiveInvoiceFilters,
	escapeLikePattern,
	parseInvoiceFilters,
	type InvoiceSortKey,
} from '$lib/invoice-filters';

const PAGE_SIZE = 50;

const SORT_OPTIONS: Record<InvoiceSortKey, SQL> = {
	uploaded_desc:     desc(invoices.createdAt),
	uploaded_asc:      asc(invoices.createdAt),
	invoice_date_desc: desc(invoices.invoiceDate),
	invoice_date_asc:  asc(invoices.invoiceDate),
};

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('invoices', async () => {
		const { rangeFrom, rangeTo } = await parent?.() ?? periodRange(url);
		const savedId = parseInt(url.searchParams.get('saved') ?? '', 10);
		const filters = parseInvoiceFilters(url.searchParams);
		const {
			q, status, supplier_id: supplierId, category,
			date_from: dateFrom, date_to: dateTo,
			uploaded_from: uploadedFrom, uploaded_to: uploadedTo,
			sort,
		} = filters;
		const supplierIdNum = Number.parseInt(supplierId, 10);
		const page       = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
		const offset     = (page - 1) * PAGE_SIZE;
		const effectiveDateFrom = dateFrom || rangeFrom;
		const effectiveDateTo   = dateTo   || rangeTo;

		const conditions: SQL[] = [tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)];
		const reviewFilter = invoiceReviewFilter(status);
		if (reviewFilter) conditions.push(reviewFilter);
		if (Number.isFinite(supplierIdNum)) conditions.push(eq(invoices.supplierId, supplierIdNum));
		if (category)           conditions.push(eq(suppliers.category, category));
		if (effectiveDateFrom)  conditions.push(gte(invoices.invoiceDate, effectiveDateFrom));
		if (effectiveDateTo)    conditions.push(lte(invoices.invoiceDate, effectiveDateTo));
		if (uploadedFrom) conditions.push(gte(invoices.createdAt, new Date(`${uploadedFrom}T00:00:00`)));
		if (uploadedTo)   conditions.push(lte(invoices.createdAt, new Date(`${uploadedTo}T23:59:59.999`)));
		if (q) {
			const pattern = `%${escapeLikePattern(q)}%`;
			conditions.push(or(ilike(invoices.invoiceNumber, pattern), ilike(suppliers.name, pattern))!);
		}

		const [invoiceRows, statsRow, trendRows, supplierCountRow, supplierRows, countRow] = await Promise.all([
			db.select({
				id:             invoices.id,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				invoice_date:   invoices.invoiceDate,
				due_date:       invoices.dueDate,
				total_amount:   invoices.totalAmount,
				review_state:   invoices.reviewState,
				incidence_kind: invoices.incidenceKind,
				confidence:     invoices.confidence,
				source_file:    invoices.sourceFile,
				created_at:     invoices.createdAt,
				notes:          invoices.notes,
			})
				.from(invoices)
				.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
				// tenant-scope-ok: conditions[0] is tdb.scope(invoices.restaurantId)
				.where(and(...conditions))
				.orderBy(SORT_OPTIONS[sort])
				.limit(PAGE_SIZE)
				.offset(offset),

			db.select({
				reviewed_count: sql<number>`COUNT(CASE WHEN ${invoices.reviewState}='revisado' THEN 1 END)`,
				to_review_count: sql<number>`COUNT(CASE WHEN ${invoices.reviewState}='por_revisar' THEN 1 END)`,
				issue_count:    sql<number>`COUNT(CASE WHEN ${invoices.reviewState}='incidencia' THEN 1 END)`,
			})
				.from(invoices)
				.where(tdb.scope(invoices.restaurantId, and(isNull(invoices.deletedAt), gte(invoices.invoiceDate, rangeFrom), lte(invoices.invoiceDate, rangeTo)))),

			db.execute<{ month: string; revisado: string; por_revisar: string; incidencia: string }>(sql`
				SELECT
					TO_CHAR(DATE_TRUNC('month', invoice_date), 'YYYY-MM') AS month,
					COALESCE(SUM(CASE WHEN review_state='revisado' THEN total_amount::numeric ELSE 0 END),0) AS revisado,
					COALESCE(SUM(CASE WHEN review_state='por_revisar' THEN total_amount::numeric ELSE 0 END),0) AS por_revisar,
					COALESCE(SUM(CASE WHEN review_state='incidencia' THEN total_amount::numeric ELSE 0 END),0) AS incidencia
				FROM invoices
				WHERE restaurant_id = ${rid}
				  AND deleted_at IS NULL
				  AND invoice_date >= ${rangeFrom} AND invoice_date <= ${rangeTo}
				GROUP BY DATE_TRUNC('month', invoice_date)
				ORDER BY DATE_TRUNC('month', invoice_date) ASC
			`),

			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(suppliers)
				.where(tdb.scope(suppliers.restaurantId)),

			db.select({ id: suppliers.id, name: suppliers.name, category: suppliers.category })
				.from(suppliers)
				.where(tdb.scope(suppliers.restaurantId))
				.orderBy(asc(suppliers.name)),

			// tenant-scope-ok: conditions[0] is tdb.scope(invoices.restaurantId)
			db.select({ cnt: count() })
				.from(invoices)
				.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
				.where(and(...conditions)),
		]);

		const savedAlerts = Number.isFinite(savedId)
			? await db.select({
				id:               systemNotifications.id,
				notificationType: systemNotifications.notificationType,
				message:          systemNotifications.message,
				payload:          systemNotifications.payload,
			})
				.from(systemNotifications)
				.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.invoiceId, savedId)))
			: [];

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
				.where(tdb.scope(invoiceLineItems.restaurantId, inArray(invoiceLineItems.invoiceId, invoiceIds)))
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
			total_amount: moneyToNullableNumber(inv.total_amount),
			line_items: (lineItemsByInvoice.get(inv.id) ?? []).map(li => ({
				...li,
				unit_price: moneyToNullableNumber(li.unit_price),
				total_price: moneyToNullableNumber(li.total_price),
			})),
		}));

		const stats = {
			reviewed_count: Number(statsRow[0]?.reviewed_count ?? 0),
			to_review_count: Number(statsRow[0]?.to_review_count ?? 0),
			issue_count: Number(statsRow[0]?.issue_count ?? 0),
		};
		const total = Number(countRow[0]?.cnt ?? 0);

		const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
		const trendData = {
			xLabels: trendRows.map(r => MONTH_LABELS[(Number.parseInt(r.month.split('-')[1], 10) - 1)] ?? r.month),
			series: [
				{ key: 'revisado',    labelKey: 'inv.review.revisado',    values: trendRows.map(r => Number(r.revisado))    },
				{ key: 'por_revisar', labelKey: 'inv.review.por_revisar', values: trendRows.map(r => Number(r.por_revisar)) },
				{ key: 'incidencia',  labelKey: 'inv.review.incidencia',  values: trendRows.map(r => Number(r.incidencia))  },
			],
		};

		return {
			title: 'inv.title',
			invoices: invoiceList,
			stats: { ...stats, supplier_count: supplierCountRow[0]?.cnt ?? 0 },
			suppliers: supplierRows,
			trendData,
			filters,
			activeFilterCount: countActiveInvoiceFilters(filters),
			conflict: url.searchParams.get('conflict') === '1',
			savedInvoiceId: Number.isFinite(savedId) ? savedId : null,
			savedAlerts,
			pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
		};
	});
};

export const actions: Actions = {
	markReviewed: async ({ request, locals }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const rid = locals.restaurantId!;
		const ok = await markInvoiceReviewed(id, rid);
		if (ok) trackEvent('invoice_review_state_changed', rid, { to: 'revisado' }, id);
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
	bulkReviewed: async ({ request, locals }) => {
		const rid = locals.restaurantId!;
		if (!await rateLimitScoped({ scope: 'tenant', name: 'bulk', max: 10 }, { restaurantId: rid })) redirect(303, '/invoices');
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		await markInvoicesReviewedBulk(ids, rid);
		redirect(303, '/invoices');
	},
	bulkDelete: async ({ request, locals }) => {
		const data = await request.formData();
		const ids = data.getAll('invoice_ids').map(Number).filter(Boolean);
		const rid = locals.restaurantId!;
		if (!await rateLimitScoped({ scope: 'tenant', name: 'bulk', max: 10 }, { restaurantId: rid })) redirect(303, '/invoices');
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
