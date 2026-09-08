import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { suppliers, systemNotifications } from '$lib/server/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { visibleCategoryNames } from '$lib/server/categories';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import { idempotencyKeyField, withIdempotency } from '$lib/server/api-idempotency';

const SUPPLIER_ID_REQUIRED = 'supplierId required';

const SupplierCategoryBody = v.object({
	supplierId: v.pipe(v.number(SUPPLIER_ID_REQUIRED), v.integer(SUPPLIER_ID_REQUIRED)),
	action: v.picklist(['accept', 'dismiss'], "action must be 'accept' or 'dismiss'"),
	category: v.optional(v.string(), ''),
	idempotency_key: idempotencyKeyField,
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) return apiError(409, 'No active restaurant');
	if (!(await rateLimitScoped({ scope: 'tenant', name: 'supplier-category', max: 60 }, { restaurantId: rid }))) {
		return apiError(429, 'Too many requests');
	}

	const parsed = await parseJson(SupplierCategoryBody, request);
	if (!parsed.success) return invalidBody(parsed, 422, SUPPLIER_ID_REQUIRED);
	const { supplierId, action, category, idempotency_key } = parsed.output;

	const tdb = forTenant(rid);

	return withIdempotency(idempotency_key, rid, async () => {
		if (action === 'accept') {
			if (category === UNCATEGORIZED_CATEGORY || !(await visibleCategoryNames(rid)).has(category)) {
				return apiError(422, 'unknown category');
			}
			const updated = await db
				.update(suppliers)
				.set({ category })
				.where(tdb.scope(
					suppliers.restaurantId,
					and(
						eq(suppliers.id, supplierId),
						or(isNull(suppliers.category), eq(suppliers.category, UNCATEGORIZED_CATEGORY)),
					),
				))
				.returning({ id: suppliers.id });
			if (updated.length === 0) {
				await dismissSuggestion(rid, supplierId);
				return apiError(404, 'supplier not found or already categorised');
			}
		}

		await dismissSuggestion(rid, supplierId);
		return json({ ok: true });
	});
};

async function dismissSuggestion(rid: string, supplierId: number): Promise<void> {
	const tdb = forTenant(rid);
	await db
		.update(systemNotifications)
		.set({ status: 'sent' })
		.where(tdb.scope(
			systemNotifications.restaurantId,
			and(
				eq(systemNotifications.notificationType, 'supplier_category_suggested'),
				eq(systemNotifications.status, 'pending'),
				sql`${systemNotifications.payload}->>'supplierId' = ${String(supplierId)}`,
			),
		));
}
