import type { PageServerLoad } from './$types';
import { safe } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { invoices, suppliers, systemNotifications, restaurants, batchItems } from '$lib/server/schema';
import { sql } from 'drizzle-orm';
import { runSystemChecks } from '$lib/server/system-health';
import { restaurantActivity, type RestaurantActivity } from '$lib/server/pipeline-stats';
import { workerLiveness } from '$lib/server/worker-heartbeat';

type CountsRow = {
	invoices_7d: string; invoices_prev_7d: string; active_restaurants_7d: string;
	pending_notifs: string; total_invoices: string; total_suppliers: string;
	total_restaurants: string; pending_extractions: string;
};

async function counts() {
	const rows = await db.execute(sql`
		SELECT
			(SELECT COUNT(*) FROM ${invoices}
				WHERE ${invoices.createdAt} > NOW() - INTERVAL '7 days') AS invoices_7d,
			(SELECT COUNT(*) FROM ${invoices}
				WHERE ${invoices.createdAt} > NOW() - INTERVAL '14 days'
				  AND ${invoices.createdAt} <= NOW() - INTERVAL '7 days') AS invoices_prev_7d,
			(SELECT COUNT(DISTINCT ${invoices.restaurantId}) FROM ${invoices}
				WHERE ${invoices.createdAt} > NOW() - INTERVAL '7 days') AS active_restaurants_7d,
			(SELECT COUNT(*) FROM ${systemNotifications}
				WHERE ${systemNotifications.status} = 'pending') AS pending_notifs,
			(SELECT COUNT(*) FROM ${invoices}) AS total_invoices,
			(SELECT COUNT(*) FROM ${suppliers}) AS total_suppliers,
			(SELECT COUNT(*) FROM ${restaurants}) AS total_restaurants,
			(SELECT COUNT(*) FROM ${batchItems}
				WHERE ${batchItems.status} IN ('queued', 'extracting')) AS pending_extractions
	`) as unknown as CountsRow[];

	const r = rows[0];

	return {
		invoices7d:          Number(r?.invoices_7d ?? 0),
		invoicesPrev7d:      Number(r?.invoices_prev_7d ?? 0),
		activeRestaurants7d: Number(r?.active_restaurants_7d ?? 0),
		pendingNotifs:       Number(r?.pending_notifs ?? 0),
		totalInvoices:       Number(r?.total_invoices ?? 0),
		totalSuppliers:      Number(r?.total_suppliers ?? 0),
		totalRestaurants:    Number(r?.total_restaurants ?? 0),
		pendingExtractions:  Number(r?.pending_extractions ?? 0),
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

export const load: PageServerLoad = async () => {
	const [health, metrics, recentActivity, recentRestaurants] = await Promise.all([
		safe('admin/health-checks', () => runSystemChecks(), null),
		safe('admin/counts', counts, EMPTY_COUNTS),
		safe('admin/activity', async () => {
			const rows = await db.execute(sql`
				SELECT sn.id, sn.notification_type, sn.message, sn.created_at,
					r.name AS restaurant_name
				FROM system_notifications sn
				LEFT JOIN restaurants r ON r.id = sn.restaurant_id
				ORDER BY sn.created_at DESC
				LIMIT 8
			`) as unknown as Array<Partial<ActivityRow>>;
			return rows.map((row, i): ActivityRow => ({
				id:              Number(row.id ?? i),
				notification_type: row.notification_type ?? '',
				message:         row.message ?? '',
				created_at:      row.created_at ?? new Date().toISOString(),
				restaurant_name: row.restaurant_name ?? null,
			}));
		}, [] as ActivityRow[]),
		safe('admin/restaurants', () => restaurantActivity(), [] as RestaurantActivity[]),
	]);

	return {
		title: 'admin.overview',
		degraded:    health === null,
		overall:     health?.overall ?? 'error',
		checkedAt:   health?.checkedAt ?? new Date().toISOString(),
		gates:       health?.gates ?? { dbRole: 'warn' as const, migrations: 'warn' as const, worker: 'warn' as const },
		worker:      health?.worker ?? workerLiveness(null),
		dbRole:      health?.dbRole ?? null,
		migrations:  health?.migrations ?? null,
		sentry:      health?.sentry ?? { configured: false, unresolved: 0, critical: 0, events24h: 0 },
		queue:       health?.queue ?? { stuck: 0, lastExtraction: null, depth: null },
		extraction:  health?.extraction ?? null,
		deadLetters: health?.deadLetters ?? { pending: 0 },
		access:      health?.access ?? { pending: 0 },
		...metrics,
		recentActivity,
		recentRestaurants,
	};
};
