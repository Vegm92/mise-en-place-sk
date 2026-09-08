import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { desc, eq } from 'drizzle-orm';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { LIST_ROW_CAP } from '$lib/server/env';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import { idempotencyKeyField, withIdempotency } from '$lib/server/api-idempotency';

const DismissBody = v.object({
	id: v.pipe(v.number('id required'), v.integer('id required')),
	idempotency_key: idempotencyKeyField,
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!await rateLimitScoped({ scope: 'user', name: 'notifications', max: 60 }, { userId: locals.user!.id })) {
		return apiError(429, 'Too many requests');
	}
	const rid    = locals.restaurantId!;
	const tdb    = forTenant(rid);
	const status = url.searchParams.get('status') ?? 'pending';

	const fetched = await db
		.select()
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.status, status)))
		.orderBy(desc(systemNotifications.id))
		.limit(LIST_ROW_CAP + 1);

	const truncated = fetched.length > LIST_ROW_CAP;

	return json({ notifications: truncated ? fetched.slice(0, LIST_ROW_CAP) : fetched, truncated });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!await rateLimitScoped({ scope: 'user', name: 'notifications', max: 60 }, { userId: locals.user!.id })) {
		return apiError(429, 'Too many requests');
	}
	const rid  = locals.restaurantId!;
	const tdb  = forTenant(rid);

	const parsed = await parseJson(DismissBody, request);
	if (!parsed.success) return invalidBody(parsed, 422, 'id required');
	const { id, idempotency_key } = parsed.output;

	return withIdempotency(idempotency_key, rid, async () => {
		await db
			.update(systemNotifications)
			.set({ status: 'sent' })
			.where(tdb.scope(systemNotifications.restaurantId, eq(systemNotifications.id, id)));

		return json({ ok: true });
	});
};
