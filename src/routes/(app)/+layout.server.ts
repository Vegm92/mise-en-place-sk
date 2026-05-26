import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const rawNotifs = db
		.select()
		.from(systemNotifications)
		.where(eq(systemNotifications.status, 'pending'))
		.orderBy(desc(systemNotifications.createdAt))
		.limit(20)
		.all();

	const notifications = rawNotifs.map((n) => ({
		...n,
		payload: n.payload ? JSON.parse(n.payload) : null,
	}));

	const invoiceBadgeRow = db.get<{ cnt: number }>(
		sql`SELECT COUNT(*) as cnt FROM invoices WHERE status = 'pending'`
	);

	const reminderBadgeRow = db.get<{ cnt: number }>(
		sql`SELECT COUNT(*) as cnt FROM invoices
		    WHERE status = 'pending'
		    AND due_date BETWEEN date('now') AND date('now', '+7 days')`
	);

	const quotaUsedRow = db.get<{ cnt: number }>(
		sql`SELECT COUNT(*) as cnt FROM invoices
		    WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
	);

	const quotaLimitRow = db.get<{ value: string }>(
		sql`SELECT value FROM settings WHERE key = 'plan_quota'`
	);

	const planNameRow = db.get<{ value: string }>(
		sql`SELECT value FROM settings WHERE key = 'plan_name'`
	);

	const restaurantNameRow = db.get<{ value: string }>(
		sql`SELECT value FROM settings WHERE key = 'restaurant_name'`
	);

	return {
		user: {
			id:    locals.user.id,
			name:  locals.user.name,
			email: locals.user.email,
		},
		notifications,
		invoiceBadge:   invoiceBadgeRow?.cnt   ?? 0,
		reminderBadge:  reminderBadgeRow?.cnt  ?? 0,
		quotaUsed:      quotaUsedRow?.cnt       ?? 0,
		quotaLimit:     quotaLimitRow   ? Number(quotaLimitRow.value)  : 150,
		planName:       planNameRow?.value      ?? 'Plan Restaurante',
		restaurantName: restaurantNameRow?.value ?? 'Casa Lúa',
	};
};
