import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { isAdminUser } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { eq, sql, type SQL } from 'drizzle-orm';

const PAGE_SIZE = 50;

const EVENT_STATUSES = ['pending', 'resolved', 'dismissed'] as const;

function eventFilters(type: string, status: string, q: string): SQL {
	const conds: SQL[] = [];
	if (type) conds.push(sql`sn.notification_type = ${type}`);
	if (status) conds.push(sql`sn.status = ${status}`);
	if (q) conds.push(sql`sn.message ILIKE ${'%' + q + '%'}`);
	return conds.length ? sql.join(conds, sql` AND `) : sql`1=1`;
}

export const load: PageServerLoad = async ({ url }) => {
	const pageParam = parseInt(url.searchParams.get('page') ?? '1', 10);
	const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
	const typeFilter = (url.searchParams.get('type') ?? '').slice(0, 64);
	const statusParam = url.searchParams.get('status') ?? '';
	const statusFilter = (EVENT_STATUSES as readonly string[]).includes(statusParam) ? statusParam : '';
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);

	return handleLoad('admin/events', async () => {
		const offset = (page - 1) * PAGE_SIZE;
		const where = eventFilters(typeFilter, statusFilter, q);

		const [totalRows, rows, typeRows] = await Promise.all([
			db.execute(sql`
				SELECT COUNT(*) AS cnt
				FROM system_notifications sn
				WHERE ${where}
			`),

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
				WHERE ${where}
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

		const total = Number((totalRows as unknown as Array<{ cnt: string }>)[0]?.cnt ?? 0);
		const totalPages = Math.ceil(total / PAGE_SIZE);

		return {
			title: 'admin.events',
			events: rows as unknown as Array<{
				id: number;
				notification_type: string;
				message: string;
				status: string;
				created_at: string;
				restaurant_name: string | null;
			}>,
			typeFilter,
			statusFilter,
			q,
			page,
			totalPages,
			total,
			availableTypes: (typeRows as unknown as Array<{ notification_type: string; cnt: number }>)
				.map(r => ({ type: r.notification_type, count: Number(r.cnt) })),
		};
	});
};

export const actions: Actions = {
	setStatus: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		const id = parseInt(String(data.get('id') ?? ''), 10);
		const status = String(data.get('status') ?? '');
		if (!Number.isInteger(id) || !(EVENT_STATUSES as readonly string[]).includes(status)) {
			return fail(400, { error: 'invalidRequest' });
		}

		const updated = await db.update(systemNotifications)
			.set({ status })
			.where(eq(systemNotifications.id, id))
			.returning({ id: systemNotifications.id });
		if (updated.length === 0) return fail(404, { error: 'notFound' });
		return { success: true };
	},

	resolveFiltered: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		const type = String(data.get('type') ?? '').slice(0, 64);
		const q = String(data.get('q') ?? '').trim().slice(0, 200);

		const rows = await db.execute(sql`
			UPDATE system_notifications AS sn
			SET status = 'resolved'
			WHERE ${eventFilters(type, 'pending', q)}
			RETURNING sn.id
		`);
		return { success: true, resolved: (rows as unknown as unknown[]).length };
	},
};
