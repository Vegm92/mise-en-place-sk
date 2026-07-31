import { sql } from 'drizzle-orm';
import { db } from './db';
import type { BatchDb } from './batch-core';
import { VALID_CATEGORIES, UNCATEGORIZED_CATEGORY } from '$lib/constants';

export async function getOrCreateSupplierId(
	restaurantId: string,
	name: string,
	exec: BatchDb = db,
	category: string = UNCATEGORIZED_CATEGORY,
): Promise<number> {
	const trimmed = name.trim();
	const resolved = VALID_CATEGORIES.includes(category) ? category : UNCATEGORIZED_CATEGORY;
	const rows = await exec.execute<{ id: number }>(sql`
		INSERT INTO suppliers (restaurant_id, name, category)
		VALUES (${restaurantId}, ${trimmed}, ${resolved})
		ON CONFLICT (restaurant_id, lower(name))
		DO UPDATE SET name = suppliers.name
		RETURNING id
	`);
	return rows[0].id;
}
