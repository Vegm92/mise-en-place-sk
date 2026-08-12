import type { PageServerLoad } from './$types';
import { safe } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { invoices, suppliers, systemNotifications, restaurants, batchItems } from '$lib/server/schema';
import { sql, count, inArray } from 'drizzle-orm';
import { runSystemChecks } from '$lib/server/system-health';

async function counts() {
	const [
		invoices7dRow,
		invoicesPrev7dRow,
		activeRestaurants7dRow,
		pendingNotifsRow,
		totalInvoicesRow,
		totalSuppliersRow,
		totalRestaurantsRow,
		pendingExtractionsRow,
	] = await Promise.all([
		db.select({ cnt: sql<number>`COUNT(*)` })
			.from(invoices)
			.where(sql`${invoices.createdAt} > NOW() - INTERVAL '7 days'`),

		db.select({ cnt: sql<number>`COUNT(*)` })
			.from(invoices)
			.where(sql`${invoices.createdAt} > NOW() - INTERVAL '14 days'
				AND ${invoices.createdAt} <= NOW() - INTERVAL '7 days'`),

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
	]);

	return {
		invoices7d:          Number(invoices7dRow[0]?.cnt ?? 0),
		invoicesPrev7d:      Number(invoicesPrev7dRow[0]?.cnt ?? 0),
		activeRestaurants7d: Number(activeRestaurants7dRow[0]?.cnt ?? 0),
		pendingNotifs:       Number(pendingNotifsRow[0]?.cnt ?? 0),
		totalInvoices:       Number(totalInvoicesRow[0]?.cnt ?? 0),
		totalSuppliers:      Number(totalSuppliersRow[0]?.cnt ?? 0),
		totalRestaurants:    Number(totalRestaurantsRow[0]?.cnt ?? 0),
		pendingExtractions:  Number(pendingExtractionsRow[0]?.cnt ?? 0),
	};
}

const EMPTY_COUNTS = {
	invoices7d: 0, invoicesPrev7d: 0, activeRestaurants7d: 0, pendingNotifs: 0,
	totalInvoices: 0, totalSuppliers: 0, totalRestaurants: 0, pendingExtractions: 0,
};

type ActivityRow = {
	id: number; notification_type: string; message: string;
	created_at: string; restaurant_name: string | null;
};

type RestaurantRow = {
	id: string; name: string; created_at: string;
	invoice_count: number; supplier_count: number;
};

export const load: PageServerLoad = async () => {
	const [health, metrics, recentActivity, recentRestaurants] = await Promise.all([
		safe('admin/health-checks', () => runSystemChecks(), null),
		safe('admin/counts', counts, EMPTY_COUNTS),
		safe('admin/activity', async () => await db.execute(sql`
			SELECT sn.id, sn.notification_type, sn.message, sn.created_at,
				r.name AS restaurant_name
			FROM system_notifications sn
			LEFT JOIN restaurants r ON r.id = sn.restaurant_id
			ORDER BY sn.created_at DESC
			LIMIT 8
		`) as unknown as ActivityRow[], [] as ActivityRow[]),
		safe('admin/restaurants', async () => await db.execute(sql`
			SELECT r.id, r.name, r.created_at,
				(SELECT COUNT(*) FROM invoices i WHERE i.restaurant_id = r.id) AS invoice_count,
				(SELECT COUNT(*) FROM suppliers s WHERE s.restaurant_id = r.id) AS supplier_count
			FROM restaurants r
			ORDER BY r.created_at DESC
			LIMIT 10
		`) as unknown as RestaurantRow[], [] as RestaurantRow[]),
	]);

	return {
		title: 'Admin Overview',
		degraded:    health === null,
		overall:     health?.overall ?? 'error',
		checkedAt:   health?.checkedAt ?? new Date().toISOString(),
		sentry:      health?.sentry ?? { configured: false, unresolved: 0, critical: 0 },
		queue:       health?.queue ?? { stuck: 0, lastExtraction: null },
		deadLetters: health?.deadLetters ?? { pending: 0 },
		...metrics,
		recentActivity,
		recentRestaurants,
	};
};
