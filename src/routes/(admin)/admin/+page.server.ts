import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { invoices, suppliers, systemNotifications, restaurants, batchItems } from '$lib/server/schema';
import { sql, count, inArray } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	return handleLoad('admin/overview', async () => {
		const [
			invoices7dRow,
			activeRestaurants7dRow,
			pendingNotifsRow,
			totalInvoicesRow,
			totalSuppliersRow,
			totalRestaurantsRow,
			pendingExtractionsRow,
			recentRestaurantsRows,
		] = await Promise.all([
			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(invoices)
				.where(sql`${invoices.createdAt} > NOW() - INTERVAL '7 days'`),

			db.select({ cnt: sql<number>`COUNT(DISTINCT ${invoices.restaurantId})` })
				.from(invoices)
				.where(sql`${invoices.createdAt} > NOW() - INTERVAL '7 days'`),

			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(systemNotifications)
				.where(sql`${systemNotifications.status} = 'pending'`),

			db.select({ cnt: count() }).from(invoices),

			db.select({ cnt: count() }).from(suppliers),

			db.select({ cnt: count() }).from(restaurants),

			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(batchItems)
				.where(inArray(batchItems.status, ['queued', 'extracting'])),

			db.execute(sql`
				SELECT r.id, r.name, r.created_at,
					(SELECT COUNT(*) FROM invoices i WHERE i.restaurant_id = r.id) AS invoice_count,
					(SELECT COUNT(*) FROM suppliers s WHERE s.restaurant_id = r.id) AS supplier_count
				FROM restaurants r
				ORDER BY r.created_at DESC
				LIMIT 10
			`),
		]);

		return {
			title: 'Admin Overview',
			invoices7d:           Number(invoices7dRow[0]?.cnt ?? 0),
			activeRestaurants7d:  Number(activeRestaurants7dRow[0]?.cnt ?? 0),
			pendingNotifs:        Number(pendingNotifsRow[0]?.cnt ?? 0),
			totalInvoices:        Number(totalInvoicesRow[0]?.cnt ?? 0),
			totalSuppliers:       Number(totalSuppliersRow[0]?.cnt ?? 0),
			totalRestaurants:     Number(totalRestaurantsRow[0]?.cnt ?? 0),
			pendingExtractions:   Number(pendingExtractionsRow[0]?.cnt ?? 0),
			recentRestaurants:    recentRestaurantsRows as unknown as Array<{
				id: string; name: string; created_at: string;
				invoice_count: number; supplier_count: number;
			}>,
		};
	});
};
