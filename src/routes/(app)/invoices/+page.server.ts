import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, systemNotifications } from '$lib/server/schema';
import { trackEvent } from '$lib/server/events';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { invoiceStatusFilter, markInvoicePaid, markInvoiceUnpaid, markInvoicesPaidBulk } from '$lib/server/invoice-status';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { moneyToNumber, moneyToNullableNumber } from '$lib/server/money';
import { periodToDate } from '$lib/constants';
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

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('invoices', async () => {
		const savedId = parseInt(url.searchParams.get('saved') ?? '', 10);
		const filters = parseInvoiceFilters(url.searchParams);
		const {
			q, status, supplier_id: supplierId, category,
			date_from: dateFrom, date_to: dateTo,
			uploaded_from: uploadedFrom, uploaded_to: uploadedTo,
			sort,
		} = filters;
		const supplierIdNum = Number.parseInt(supplierId, 10);
		const period = url.searchParams.get('period') ?? '30d';
		const periodStartStr = periodToDate(period).toISOString().slice(0, 10);
		const page       = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
		const offset     = (page - 1) * PAGE_SIZE;

		const conditions: SQL[] = [tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)];
		const statusFilter = invoiceStatusFilter(status);
		if (statusFilter) conditions.push(statusFilter);
		if (Number.isFinite(supplierIdNum)) conditions.push(eq(invoices.supplierId, supplierIdNum));
		if (category)     conditions.push(eq(suppliers.category, category));
		if (dateFrom)     conditions.push(gte(invoices.invoiceDate, dateFrom));
		if (dateTo)       conditions.push(lte(invoices.invoiceDate, dateTo));
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
				status:         invoices.status,
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
				pending_amount: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.status}='pending' THEN COALESCE(${invoices.totalAmount},0) ELSE 0 END),0)`,
				pending_count:  sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' THEN 1 END)`,
				overdue_count:  sql<number>`COUNT(CASE WHEN ${invoices.status}='pending' AND ${invoices.dueDate} < CURRENT_DATE AND ${invoices.dueDate} IS NOT NULL THEN 1 END)`,
				paid_count:     sql<number>`COUNT(CASE WHEN ${invoices.status}='paid' THEN 1 END)`,
			})
				.from(invoices)
				.where(tdb.scope(invoices.restaurantId, and(isNull(invoices.deletedAt), gte(invoices.invoiceDate, periodStartStr)))),

			db.execute<{ month: string; paid: string; pending: string; overdue: string }>(sql`
				SELECT
					TO_CHAR(DATE_TRUNC('month', invoice_date), 'YYYY-MM') AS month,
					COALESCE(SUM(CASE WHEN status='paid' THEN total_amount::numeric ELSE 0 END),0) AS paid,
					COALESCE(SUM(CASE WHEN status='pending' AND (due_date IS NULL OR due_date >= CURRENT_DATE) THEN total_amount::numeric ELSE 0 END),0) AS pending,
					COALESCE(SUM(CASE WHEN status='pending' AND due_date IS NOT NULL AND due_date < CURRENT_DATE THEN total_amount::numeric ELSE 0 END),0) AS overdue
				FROM invoices
				WHERE restaurant_id = ${rid}
				  AND deleted_at IS NULL
				  AND invoice_date >= (NOW() - INTERVAL '6 months')::date
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
			? (await db.select({ message: systemNotifications.message })
				.from(systemNotifications)
				.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.invoiceId, savedId))))
				.map(r => r.message)
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
			pending_amount: moneyToNumber(statsRow[0]?.pending_amount ?? '0'),
			pending_count: statsRow[0]?.pending_count ?? 0,
			overdue_count: statsRow[0]?.overdue_count ?? 0,
			paid_count: statsRow[0]?.paid_count ?? 0,
		};
		const total = Number(countRow[0]?.cnt ?? 0);

		const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
		const trendData = {
			xLabels: trendRows.map(r => MONTH_LABELS[(Number.parseInt(r.month.split('-')[1], 10) - 1)] ?? r.month),
			series: [
				{ key: 'paid',    labelKey: 'inv.kpi.paid',    values: trendRows.map(r => Number(r.paid))    },
				{ key: 'pending', labelKey: 'inv.kpi.pending',  values: trendRows.map(r => Number(r.pending)) },
				{ key: 'overdue', labelKey: 'inv.kpi.overdue',  values: trendRows.map(r => Number(r.overdue)) },
			],
		};

		return {
			title: 'inv.title',
			invoices: invoiceList,
			stats: { ...stats, supplier_count: supplierCountRow[0]?.cnt ?? 0 },
			suppliers: supplierRows,
			period,
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
