import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { sql } from 'drizzle-orm';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const pageParam = parseInt(url.searchParams.get('page') ?? '1', 10);
	const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
	const typeFilter = (url.searchParams.get('type') ?? '').slice(0, 64);

	return handleLoad('admin/events', async () => {
		const offset = (page - 1) * PAGE_SIZE;

		const whereClause = typeFilter
			? sql`${systemNotifications.notificationType} = ${typeFilter}`
			: sql`1=1`;
		const whereClauseAliased = typeFilter
			? sql`sn.notification_type = ${typeFilter}`
			: sql`1=1`;

		const [totalRow, rows, typeRows] = await Promise.all([
			db.select({ cnt: sql<number>`COUNT(*)` })
				.from(systemNotifications)
				.where(whereClause),

			db.execute(sql`
				SELECT
					sn.id,
					sn.notification_type,
					sn.message,
					sn.status,
					sn.created_at,
					r.name AS restaurant_name
				FROM system_notifications sn
				LEFT JOIN restaurants r ON r.id = sn.restaurant_id
				WHERE ${whereClauseAliased}
				ORDER BY sn.created_at DESC
				LIMIT ${PAGE_SIZE} OFFSET ${offset}
			`),

			db.execute(sql`
				SELECT notification_type, COUNT(*) AS cnt
				FROM system_notifications
				GROUP BY notification_type
				ORDER BY cnt DESC
			`),
		]);

		const total = Number(totalRow[0]?.cnt ?? 0);
		const totalPages = Math.ceil(total / PAGE_SIZE);

		return {
			title: 'Admin · Events',
			events: rows as unknown as Array<{
				id: number;
				notification_type: string;
				message: string;
				status: string;
				created_at: string;
				restaurant_name: string | null;
			}>,
			typeFilter,
			page,
			totalPages,
			total,
			availableTypes: (typeRows as unknown as Array<{ notification_type: string; cnt: number }>)
				.map(r => ({ type: r.notification_type, count: Number(r.cnt) })),
		};
	});
};
