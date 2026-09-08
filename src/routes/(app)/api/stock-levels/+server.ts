import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { stockLevels } from '$lib/server/schema';
import { asc, sql } from 'drizzle-orm';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { hasFeature } from '$lib/server/billing';
import { LIST_ROW_CAP } from '$lib/server/env';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import { idempotencyKeyField, withIdempotency } from '$lib/server/api-idempotency';

const MISSING_FIELDS = 'Missing required fields: ingredient, daily_burn_rate';

const StockLevelBody = v.object({
	ingredient: v.pipe(v.string(MISSING_FIELDS), v.trim(), v.minLength(1, MISSING_FIELDS)),
	daily_burn_rate: v.union([v.number(), v.pipe(v.string(), v.decimal())], 'daily_burn_rate must be a number'),
	current_stock: v.optional(v.nullable(v.union([v.number(), v.pipe(v.string(), v.decimal())], 'current_stock must be a number'))),
	canonical_unit: v.optional(v.nullable(v.pipe(v.string(), v.trim()))),
	idempotency_key: idempotencyKeyField,
});

export const GET: RequestHandler = async ({ locals }) => {
	if (!await rateLimitScoped({ scope: 'user', name: 'stock-levels', max: 60 }, { userId: locals.user!.id })) {
		return apiError(429, 'Too many requests');
	}
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	if (!(await hasFeature('stockTracking', locals))) return apiError(402, 'plan_upgrade_required');

	const fetched = await db
		.select()
		.from(stockLevels)
		.where(tdb.scope(stockLevels.restaurantId))
		.orderBy(asc(stockLevels.ingredient))
		.limit(LIST_ROW_CAP + 1);

	const truncated = fetched.length > LIST_ROW_CAP;

	return json({ stock_levels: truncated ? fetched.slice(0, LIST_ROW_CAP) : fetched, truncated });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!await rateLimitScoped({ scope: 'user', name: 'stock-levels', max: 60 }, { userId: locals.user!.id })) {
		return apiError(429, 'Too many requests');
	}
	const rid = locals.restaurantId!;
	if (!(await hasFeature('stockTracking', locals))) return apiError(402, 'plan_upgrade_required');

	const parsed = await parseJson(StockLevelBody, request);
	if (!parsed.success) return invalidBody(parsed, 422, MISSING_FIELDS);
	const { ingredient, daily_burn_rate, current_stock, canonical_unit, idempotency_key } = parsed.output;

	const burnRate = Number(daily_burn_rate);
	const stockVal = current_stock == null ? 0 : Number(current_stock);
	const canonUnit = canonical_unit || null;

	return withIdempotency(idempotency_key, rid, async () => {
		await db.insert(stockLevels)
			.values({
				restaurantId:  rid,
				ingredient,
				dailyBurnRate: burnRate,
				currentStock:  stockVal,
				canonicalUnit: canonUnit,
				updatedAt:     sql`CURRENT_TIMESTAMP`,
			})
			.onConflictDoUpdate({
				target: [stockLevels.restaurantId, stockLevels.ingredient],
				set: {
					dailyBurnRate: burnRate,
					currentStock:  stockVal,
					canonicalUnit: canonUnit,
					updatedAt:     sql`CURRENT_TIMESTAMP`,
				},
			});

		return json({ ok: true, ingredient, daily_burn_rate: burnRate });
	});
};
