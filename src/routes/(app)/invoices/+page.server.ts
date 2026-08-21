import { redirect } from '@sveltejs/kit';
import { handleLoad } from '$lib/server/load-guard';
import type { Actions, PageServerLoad } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, systemNotifications } from '$lib/server/schema';
import { trackEvent } from '$lib/server/events';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { markInvoicePaid, markInvoiceUnpaid, markInvoicesPaidBulk } from '$lib/server/invoice-status';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { moneyToNumber, moneyToNullableNumber } from '$lib/server/money';
import { toIsoDate } from '$lib/server/dates';
import { isPeriodKey, periodRange, deltaPct, type PeriodKey } from '$lib/server/period';
import { bucketSeries } from '$lib/server/period-series';

const LOW_CONFIDENCE_THRESHOLD = 0.85;

const PAGE_SIZE = 50;

const SORT_OPTIONS = {
	uploaded_desc:     desc(invoices.createdAt),
	uploaded_asc:      asc(invoices.createdAt),
	invoice_date_desc: desc(invoices.invoiceDate),
	invoice_date_asc:  asc(invoices.invoiceDate),
} as const;
type SortKey = keyof typeof SORT_OPTIONS;
function isSortKey(v: string): v is SortKey {
	return v in SORT_OPTIONS;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	return handleLoad('invoices', async () => {
		const savedId = parseInt(url.searchParams.get('saved') ?? '', 10);
		const q            = url.searchParams.get('q') ?? '';
		const status       = url.searchParams.get('status') ?? '';
		const supplierId   = url.searchParams.get('supplier_id') ?? '';
		const dateFrom     = toIsoDate(url.searchParams.get('date_from')) ?? '';
		const dateTo       = toIsoDate(url.searchParams.get('date_to')) ?? '';
		const uploadedFrom = url.searchParams.get('uploaded_from') ?? '';
		const uploadedTo   = url.searchParams.get('uploaded_to') ?? '';
		const sortParam    = url.searchParams.get('sort') ?? '';
		const sort: SortKey = isSortKey(sortParam) ? sortParam : 'uploaded_desc';
		const page       = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
		const offset     = (page - 1) * PAGE_SIZE;

		const periodParam = url.searchParams.get('period') ?? '';
		const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : 'month';
		const { from: periodFrom, prevFrom, prevTo } = periodRange(period);

		const conditions: SQL[] = [tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)];
		if (status)       conditions.push(eq(invoices.status, status));
		if (supplierId)   conditions.push(eq(invoices.supplierId, parseInt(supplierId, 10)));
		if (dateFrom)     conditions.push(gte(invoices.invoiceDate, dateFrom));
		if (dateTo)       conditions.push(lte(invoices.invoiceDate, dateTo));
		if (uploadedFrom) conditions.push(gte(invoices.createdAt, new Date(`${uploadedFrom}T00:00:00`)));
		if (uploadedTo)   conditions.push(lte(invoices.createdAt, new Date(`${uploadedTo}T23:59:59.999`)));
		if (q) {
			const likeQ = `%${q}%`;
			const matchingSupplierIds = db.select({ id: suppliers.id }).from(suppliers)
				.where(and(tdb.scope(suppliers.restaurantId), ilike(suppliers.name, likeQ)));
			conditions.push(or(
				ilike(invoices.invoiceNumber, likeQ),
				inArray(invoices.supplierId, matchingSupplierIds),
			) as SQL);
		}

		const periodScope = periodFrom ? gte(invoices.createdAt, periodFrom) : undefined;
		const prevPeriodScope = prevFrom && prevTo
			? and(gte(invoices.createdAt, prevFrom), lt(invoices.createdAt, prevTo))
			: undefined;

		// 'year'/'all' bucket by month, everything else by day -- same rule as
		// every other trend chart in the app.
		const trendBucketExpr = (period === 'year' || period === 'all')
			? sql<string>`TO_CHAR(${invoices.createdAt}, 'YYYY-MM')`
			: sql<string>`TO_CHAR(${invoices.createdAt}, 'YYYY-MM-DD')`;

		const [invoiceRows, statsRow, prevStatsRow, needsReviewRow, supplierRows, countRow, seriesRows, trendRows] = await Promise.all([
			db.select({
				id:             invoices.id,
				supplier_name:  suppliers.name,
				invoice_number: invoices.invoiceNumber,
				invoice_date:   invoices.invoiceDate,
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
				total_count:     sql<number>`COUNT(*)`,
				total_amount:    sql<string>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`,
				commented_count: sql<number>`COUNT(CASE WHEN ${invoices.notes} IS NOT NULL AND ${invoices.notes} <> '' THEN 1 END)`,
			})
				.from(invoices)
				.where(tdb.scope(invoices.restaurantId, periodScope
					? and(isNull(invoices.deletedAt), periodScope)
					: isNull(invoices.deletedAt))),

			prevPeriodScope
				? db.select({
					total_count:  sql<number>`COUNT(*)`,
					total_amount: sql<string>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`,
				})
					.from(invoices)
					.where(tdb.scope(invoices.restaurantId, and(isNull(invoices.deletedAt), prevPeriodScope)))
				: Promise.resolve(null),

			db.select({ cnt: sql<number>`COUNT(DISTINCT ${invoices.id})` })
				.from(invoices)
				.leftJoin(invoiceLineItems, and(eq(invoiceLineItems.invoiceId, invoices.id), isNull(invoiceLineItems.unitPrice)))
				.where(tdb.scope(invoices.restaurantId, and(
					isNull(invoices.deletedAt),
					or(lt(invoices.confidence, LOW_CONFIDENCE_THRESHOLD), sql`${invoiceLineItems.id} IS NOT NULL`),
					...(periodScope ? [periodScope] : []),
				))),

			db.select({ id: suppliers.id, name: suppliers.name })
				.from(suppliers)
				.where(tdb.scope(suppliers.restaurantId))
				.orderBy(asc(suppliers.name)),

			// tenant-scope-ok: conditions[0] is tdb.scope(invoices.restaurantId)
			db.select({ cnt: count() })
				.from(invoices)
				.where(and(...conditions)),

			prevFrom
				? db.select({ createdAt: invoices.createdAt, amount: invoices.totalAmount })
					.from(invoices)
					.where(tdb.scope(invoices.restaurantId, and(isNull(invoices.deletedAt), gte(invoices.createdAt, prevFrom))))
				: Promise.resolve([] as { createdAt: Date | null; amount: string | null }[]),

			db.select({
				bucket:       trendBucketExpr.as('bucket'),
				category:     sql<string>`COALESCE(${suppliers.category}, 'Other')`.as('category'),
				supplierId:   suppliers.id,
				supplierName: suppliers.name,
				amount:       sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount},0)),0)`.as('amount'),
			})
				.from(invoices)
				.innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
				.where(tdb.scope(invoices.restaurantId, periodFrom
					? and(isNull(invoices.deletedAt), gte(invoices.createdAt, periodFrom))
					: isNull(invoices.deletedAt)))
				.groupBy(trendBucketExpr, sql`COALESCE(${suppliers.category}, 'Other')`, suppliers.id, suppliers.name)
				.orderBy(trendBucketExpr),
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

		const currentCount = statsRow[0]?.total_count ?? 0;
		const currentAmount = moneyToNumber(statsRow[0]?.total_amount ?? '0');
		const prevCount = prevStatsRow ? (prevStatsRow[0]?.total_count ?? 0) : null;
		const prevAmount = prevStatsRow ? moneyToNumber(prevStatsRow[0]?.total_amount ?? '0') : null;

		const seriesInput = seriesRows
			.filter((r): r is { createdAt: Date; amount: string | null } => r.createdAt != null)
			.map(r => ({ createdAt: r.createdAt, amount: moneyToNumber(r.amount ?? '0') }));
		const countSeriesInput = seriesInput.map(r => ({ createdAt: r.createdAt, amount: 1 }));
		const amountSeries = bucketSeries(seriesInput, period, periodFrom, prevFrom, prevTo);
		const countSeries = bucketSeries(countSeriesInput, period, periodFrom, prevFrom, prevTo);

		const stats = {
			total_count: currentCount,
			total_amount: currentAmount,
			commented_count: statsRow[0]?.commented_count ?? 0,
			needs_review_count: needsReviewRow[0]?.cnt ?? 0,
			count_delta_pct: prevCount !== null ? deltaPct(currentCount, prevCount) : null,
			amount_delta_pct: prevAmount !== null ? deltaPct(currentAmount, prevAmount) : null,
			count_spark: countSeries?.current ?? null,
			count_spark_prev: countSeries?.previous ?? null,
			amount_spark: amountSeries?.current ?? null,
			amount_spark_prev: amountSeries?.previous ?? null,
		};
		const total = Number(countRow[0]?.cnt ?? 0);

		const trend = trendRows.map(r => ({
			bucket: r.bucket,
			category: r.category,
			supplierId: r.supplierId,
			supplierName: r.supplierName,
			amount: Number(r.amount),
		}));

		return {
			title: 'inv.title',
			invoices: invoiceList,
			stats,
			period,
			trend,
			suppliers: supplierRows,
			filters: {
				q, status, supplier_id: supplierId, date_from: dateFrom, date_to: dateTo,
				uploaded_from: uploadedFrom, uploaded_to: uploadedTo, sort,
			},
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
