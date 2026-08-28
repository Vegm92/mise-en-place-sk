import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!await rateLimitScoped({ scope: 'user', name: 'notifications', max: 60 }, { userId: locals.user!.id })) {
		throw error(429, 'Too many requests');
	}
	const rid    = locals.restaurantId!;
	const tdb    = forTenant(rid);
	const status = url.searchParams.get('status') ?? 'pending';

	const rows = await db
		.select()
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.status, status)));

	return json({ notifications: rows });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!await rateLimitScoped({ scope: 'user', name: 'notifications', max: 60 }, { userId: locals.user!.id })) {
		throw error(429, 'Too many requests');
	}
	const rid  = locals.restaurantId!;
	const tdb  = forTenant(rid);
	const body = await request.json().catch(() => ({}));
	const id   = body.id;
	if (!id) return json({ error: 'id required' }, { status: 422 });

	await db
		.update(systemNotifications)
		.set({ status: 'sent' })
		.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.id, id)));

	return json({ ok: true });
};
