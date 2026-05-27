import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { stockLevels } from '$lib/server/schema';
import { and, eq, sql } from 'drizzle-orm';
import { checkRateLimit } from '$lib/server/rate-limiter';

/** GET /api/stock-levels — list all stock level entries for this restaurant. */
export const GET: RequestHandler = async ({ getClientAddress, locals }) => {
	if (!checkRateLimit(getClientAddress(), 60)) throw error(429, 'Too many requests');
	const rid = locals.restaurantId!;
	const rows = await db.select().from(stockLevels).where(eq(stockLevels.restaurantId, rid));
	return json({ stock_levels: rows });
};

/** POST /api/stock-levels — upsert daily burn rate for an ingredient (TPV sync stub). */
export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
	if (!checkRateLimit(getClientAddress(), 60)) throw error(429, 'Too many requests');
	const rid = locals.restaurantId!;
	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid JSON' }, { status: 422 });

	const { ingredient, daily_burn_rate, current_stock, canonical_unit } = body;

	if (!ingredient || daily_burn_rate == null) {
		return json({ error: 'Missing required fields: ingredient, daily_burn_rate' }, { status: 422 });
	}

	const burnRate = parseFloat(daily_burn_rate);
	if (isNaN(burnRate)) return json({ error: 'daily_burn_rate must be a number' }, { status: 422 });

	const stock = parseFloat(current_stock ?? '0');
	const stockVal = isNaN(stock) ? 0 : stock;
	const canonUnit = canonical_unit?.trim() ?? null;
	const trimmed = ingredient.trim();

	await db.insert(stockLevels)
		.values({
			restaurantId:  rid,
			ingredient:    trimmed,
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

	return json({ ok: true, ingredient: trimmed, daily_burn_rate: burnRate });
};
