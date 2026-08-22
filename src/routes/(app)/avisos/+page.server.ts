import type { PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, suppliers, systemNotifications } from '$lib/server/schema';
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';

const LOW_CONFIDENCE_THRESHOLD = 0.85;
const LOW_CONFIDENCE_WINDOW_DAYS = 30;

export const load: PageServerLoad = async ({ locals }) => {
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);

	return handleLoad('avisos', async () => {
		const windowStart = new Date(Date.now() - LOW_CONFIDENCE_WINDOW_DAYS * 86_400_000);

		const [notifRows, lowConfidenceRows, pendingPriceRows, untypedSupplierRows] = await Promise.all([
			db.select()
				.from(systemNotifications)
				.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.status, 'pending')))
				.orderBy(desc(systemNotifications.createdAt))
				.limit(50),

			db.select({
				id:            invoices.id,
				supplier_name: suppliers.name,
				confidence:    invoices.confidence,
				created_at:    invoices.createdAt,
			})
				.from(invoices)
				.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
				.where(and(
					tdb.scope(invoices.restaurantId),
					isNull(invoices.deletedAt),
					lt(invoices.confidence, LOW_CONFIDENCE_THRESHOLD),
					gte(invoices.createdAt, windowStart),
				))
				.orderBy(desc(invoices.createdAt))
				.limit(20),

			db.select({
				invoice_id:    invoiceLineItems.invoiceId,
				supplier_name: suppliers.name,
				created_at:    invoices.createdAt,
				missing_count: sql<number>`COUNT(*)::int`,
			})
				.from(invoiceLineItems)
				.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
				.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
				.where(and(
					tdb.scope(invoiceLineItems.restaurantId),
					isNull(invoices.deletedAt),
					sql`${invoiceLineItems.unitPrice} IS NULL`,
				))
				.groupBy(invoiceLineItems.invoiceId, suppliers.name, invoices.createdAt)
				.orderBy(desc(invoices.createdAt))
				.limit(20),

			// Incidencia #22: un proveedor sin ningún Tipo asignado (Bebidas/Comida/Artículos)
			// no debe quedar invisible — se avisa igual que el resto de señales de arriba.
			db.select({ id: suppliers.id, name: suppliers.name })
				.from(suppliers)
				.where(and(
					tdb.scope(suppliers.restaurantId),
					sql`(${suppliers.type} IS NULL OR array_length(${suppliers.type}, 1) IS NULL)`,
				))
				.orderBy(suppliers.name)
				.limit(20),
		]);

		const notifications = notifRows.flatMap((n) => {
			let payload: unknown = null;
			if (n.payload) {
				try { payload = JSON.parse(n.payload); } catch { return []; }
			}
			return [{ ...n, payload }];
		});

		const duplicates  = notifications.filter(n => n.notificationType === 'possible_duplicate_purchase');
		const priceShocks = notifications.filter(n => n.notificationType === 'price_shock');

		return {
			title: 'avisos.title',
			duplicates,
			priceShocks,
			lowConfidence: lowConfidenceRows,
			pendingPrice:  pendingPriceRows,
			untypedSuppliers: untypedSupplierRows,
		};
	});
};
