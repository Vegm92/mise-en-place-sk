import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, forTenant } from '$lib/server/db';
import { stockLevels } from '$lib/server/schema';
import { sql } from 'drizzle-orm';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { requireFeature } from '$lib/server/billing';

export const GET: RequestHandler = async ({ locals }) => {
	if (!await checkRateLimit(`stock-levels:${locals.user!.id}`, 60)) throw error(429, 'Too many requests');
	const rid = locals.restaurantId!;
	const tdb = forTenant(rid);
	await requireFeature('stockTracking', rid);
	const rows = await db.select().from(stockLevels).where(tdb.scope(stockLevels.restaurantId));
	return json({ stock_levels: rows });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!await checkRateLimit(`stock-levels:${locals.user!.id}`, 60)) throw error(429, 'Too many requests');
	const rid = locals.restaurantId!;
	await requireFeature('stockTracking', rid);
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
