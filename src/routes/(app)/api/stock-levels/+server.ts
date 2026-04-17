import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { stockLevels } from '$lib/server/schema';
import { dbClient } from '$lib/server/db';

/** GET /api/stock-levels — list all stock level entries. */
export const GET: RequestHandler = async () => {
	const rows = await db.select().from(stockLevels);
	return json({ stock_levels: rows });
};

/** POST /api/stock-levels — upsert daily burn rate for an ingredient (TPV sync stub). */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid JSON' }, { status: 422 });

	const { ingredient, daily_burn_rate, current_stock, canonical_unit } = body;

	if (!ingredient || daily_burn_rate == null) {
		return json({ error: 'Missing required fields: ingredient, daily_burn_rate' }, { status: 422 });
	}

	const burnRate = parseFloat(daily_burn_rate);
	if (isNaN(burnRate)) return json({ error: 'daily_burn_rate must be a number' }, { status: 422 });

	const stock = parseFloat(current_stock ?? '0');

	dbClient.prepare(`
		INSERT INTO stock_levels (ingredient, daily_burn_rate, current_stock, canonical_unit, updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(ingredient) DO UPDATE SET
		    daily_burn_rate = excluded.daily_burn_rate,
		    current_stock   = excluded.current_stock,
		    canonical_unit  = excluded.canonical_unit,
		    updated_at      = CURRENT_TIMESTAMP
	`).run(ingredient.trim(), burnRate, isNaN(stock) ? 0 : stock, canonical_unit?.trim() ?? null);

	return json({ ok: true, ingredient: ingredient.trim(), daily_burn_rate: burnRate });
};
