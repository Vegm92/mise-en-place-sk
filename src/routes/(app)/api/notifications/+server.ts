import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

/** GET /api/notifications?status=pending — WhatsApp bot polls this. */
export const GET: RequestHandler = async ({ url }) => {
	const status = url.searchParams.get('status') ?? 'pending';

	const rows = await db
		.select()
		.from(systemNotifications)
		.where(eq(systemNotifications.status, status));

	const items = rows.map((row) => ({
		...row,
		payload: row.payload ? JSON.parse(row.payload) : null,
	}));

	return json({ notifications: items });
};

/** POST /api/notifications/:id/ack — mark a notification as sent. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const id = body.id;
	if (!id) return json({ error: 'id required' }, { status: 422 });

	await db
		.update(systemNotifications)
		.set({ status: 'sent' })
		.where(eq(systemNotifications.id, id));

	return json({ ok: true });
};
