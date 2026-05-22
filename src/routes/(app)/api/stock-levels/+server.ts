import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { stockLevels } from '$lib/server/schema';
import { sql } from 'drizzle-orm';
import { checkRateLimit } from '$lib/server/rate-limiter';

/** GET /api/stock-levels — list all stock level entries. */
export const GET: RequestHandler = async ({ getClientAddress }) => {
	if (!checkRateLimit(getClientAddress(), 60)) throw error(429, 'Too many requests');
	const rows = await db.select().from(stockLevels);
	return json({ stock_levels: rows });
};

/** POST /api/stock-levels — upsert daily burn rate for an ingredient (TPV sync stub). */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!checkRateLimit(getClientAddress(), 60)) throw error(429, 'Too many requests');
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

	db.insert(stockLevels)
		.values({
			ingredient:     trimmed,
			dailyBurnRate:  burnRate,
			currentStock:   stockVal,
			canonicalUnit:  canonUnit,
			updatedAt:      sql`CURRENT_TIMESTAMP`,
		})
		.onConflictDoUpdate({
			target: stockLevels.ingredient,
			set: {
				dailyBurnRate: burnRate,
				currentStock:  stockVal,
				canonicalUnit: canonUnit,
				updatedAt:     sql`CURRENT_TIMESTAMP`,
			},
		})
		.run();

	return json({ ok: true, ingredient: trimmed, daily_burn_rate: burnRate });
};
