import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { systemNotifications } from '$lib/server/schema';
import { and, eq, sql } from 'drizzle-orm';
import { normalizeProductKey } from '$lib/server/normalize';
import { confirmProductAlias, rejectProductAlias, mergeIntoProduct } from '$lib/server/products';
import type { AliasDecision } from '$lib/server/products';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import { idempotencyKeyField, withIdempotency } from '$lib/server/api-idempotency';

const DESCRIPTION_REQUIRED = 'description required';

const AliasBody = v.object({
	description: v.pipe(
		v.string(DESCRIPTION_REQUIRED),
		v.check((s) => normalizeProductKey(s).length > 0, DESCRIPTION_REQUIRED),
	),
	action: v.picklist(['confirm', 'reject', 'dismiss'], "action must be 'confirm', 'reject' or 'dismiss'"),
	targetProductId: v.optional(v.nullable(v.pipe(v.number(), v.integer()))),
	idempotency_key: idempotencyKeyField,
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) return apiError(409, 'No active restaurant');
	if (!(await rateLimitScoped({ scope: 'tenant', name: 'product-alias', max: 60 }, { restaurantId: rid }))) {
		return apiError(429, 'Too many requests');
	}

	const parsed = await parseJson(AliasBody, request);
	if (!parsed.success) return invalidBody(parsed, 422, DESCRIPTION_REQUIRED);
	const { description, action, targetProductId, idempotency_key } = parsed.output;

	return withIdempotency(idempotency_key, rid, async () => {
		if (action === 'dismiss') {
			await dismissSuggestion(rid, normalizeProductKey(description));
			return json({ ok: true });
		}

		let result: AliasDecision;
		if (action === 'reject') {
			result = await rejectProductAlias(db, rid, description);
		} else if (targetProductId != null) {
			result = await mergeIntoProduct(db, rid, description, targetProductId);
		} else {
			result = await confirmProductAlias(db, rid, description);
		}

		if (!result.ok) return apiError(404, 'No suggestion found for that description');

		await dismissSuggestion(rid, normalizeProductKey(description));
		return json({ ok: true, productId: result.productId });
	});
};

async function dismissSuggestion(rid: string, rawKey: string): Promise<void> {
	const tdb = forTenant(rid);
	await db.update(systemNotifications)
		.set({ status: 'sent' })
		.where(tdb.scope(
			systemNotifications.restaurantId,
			and(
				eq(systemNotifications.notificationType, 'product_suggestion'),
				eq(systemNotifications.status, 'pending'),
				sql`mep_norm_key(${systemNotifications.payload}->>'description') = ${rawKey}`,
			),
		));
}
