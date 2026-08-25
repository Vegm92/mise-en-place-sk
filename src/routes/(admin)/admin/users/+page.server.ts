import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export type AdminUserRow = {
	id: string;
	name: string | null;
	email: string;
	access_status: string;
	restaurants: string | null;
	event_count: number;
	last_event_at: string | null;
};

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').slice(0, 120).trim();

	return handleLoad('admin/users', async () => {
		const filter = q
			? sql`AND (u.email ILIKE ${'%' + q + '%'} OR COALESCE(u.name, '') ILIKE ${'%' + q + '%'})`
			: sql``;

		const rows = await db.execute(sql`
			SELECT
				u.id,
				u.name,
				u.email,
				u.access_status,
				(SELECT string_agg(r.name, ', ' ORDER BY r.name)
					FROM user_restaurants ur
					JOIN restaurants r ON r.id = ur.restaurant_id
					WHERE ur.user_id = u.id) AS restaurants,
				(SELECT COUNT(*) FROM system_notifications sn WHERE sn.user_id = u.id) AS event_count,
				(SELECT MAX(sn.created_at) FROM system_notifications sn WHERE sn.user_id = u.id) AS last_event_at
			FROM users u
			WHERE 1=1 ${filter}
			ORDER BY last_event_at DESC NULLS LAST, u.created_at DESC
			LIMIT 100
		`) as unknown as Array<Partial<AdminUserRow>>;

		return {
			title: 'Admin · Users',
			q,
			users: rows.map((r): AdminUserRow => ({
				id:            String(r.id ?? ''),
				name:          r.name ?? null,
				email:         r.email ?? '',
				access_status: r.access_status ?? 'pending',
				restaurants:   r.restaurants ?? null,
				event_count:   Number(r.event_count ?? 0),
				last_event_at: r.last_event_at ?? null,
			})),
		};
	});
};
