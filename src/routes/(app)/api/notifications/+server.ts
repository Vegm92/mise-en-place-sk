import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
import { checkRateLimit } from '$lib/server/rate-limiter';

/** GET /api/notifications?status=pending — WhatsApp bot polls this. */
export const GET: RequestHandler = async ({ url, getClientAddress, locals }) => {
	if (!await checkRateLimit(getClientAddress(), 60)) throw error(429, 'Too many requests');
	const rid    = locals.restaurantId!;
	const status = url.searchParams.get('status') ?? 'pending';

	const rows = await db
		.select()
		.from(systemNotifications)
		.where(and(eq(systemNotifications.restaurantId, rid), eq(systemNotifications.status, status)));

	const items = rows.map((row) => ({
		...row,
		payload: row.payload ? JSON.parse(row.payload) : null,
	}));

	return json({ notifications: items });
};

/** POST /api/notifications/:id/ack — mark a notification as sent. */
export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
	if (!await checkRateLimit(getClientAddress(), 60)) throw error(429, 'Too many requests');
	const rid  = locals.restaurantId!;
	const body = await request.json().catch(() => ({}));
	const id   = body.id;
	if (!id) return json({ error: 'id required' }, { status: 422 });

	await db
		.update(systemNotifications)
		.set({ status: 'sent' })
		.where(and(eq(systemNotifications.id, id), eq(systemNotifications.restaurantId, rid)));

	return json({ ok: true });
};
