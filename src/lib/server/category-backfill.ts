import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { enqueueCategorize } from './queue';

type Database = PostgresJsDatabase<typeof schema>;

export interface CategoryBackfillOptions {
	includeOther?: boolean;
	limit?: number;
	enqueue?: typeof enqueueCategorize;
}

export interface CategoryBackfillResult {
	cleared: number;
	enqueued: number;
}

export async function backfillProductCategories(
	database: Database,
	restaurantId: string,
	options: CategoryBackfillOptions = {},
): Promise<CategoryBackfillResult> {
	const { includeOther = false, limit = 1000 } = options;
	const enqueue = options.enqueue ?? enqueueCategorize;

	let cleared = 0;
	if (includeOther) {
		const reset = await database.execute<{ id: number }>(sql`
			UPDATE products SET category = NULL
			WHERE restaurant_id = ${restaurantId} AND category = ${UNCATEGORIZED_CATEGORY}
			RETURNING id
		`);
		cleared = reset.length;
	}

	const pending = await database.execute<{ id: number; canonical_name: string }>(sql`
		SELECT id, canonical_name FROM products
		WHERE restaurant_id = ${restaurantId} AND category IS NULL
		ORDER BY id
		LIMIT ${limit}
	`);

	let enqueued = 0;
	for (const product of pending) {
		const sent = await enqueue(restaurantId, product.id, product.canonical_name).catch((e) => {
			console.error('[category-backfill] enqueue failed (non-fatal):', e);
			return false;
		});
		if (sent) enqueued++;
	}

	return { cleared, enqueued };
}
