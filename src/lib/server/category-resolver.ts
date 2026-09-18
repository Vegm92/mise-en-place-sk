import { asc, eq } from 'drizzle-orm';
import { db, forTenant } from './db';
import type { BatchDb } from './batch';
import { categories } from './schema';
import {
	MIN_CATEGORY_CONFIDENCE, UNCATEGORIZED_CATEGORY,
	categoryKey, resolveCategory,
} from '$lib/constants';

export async function resolveCategoryFor(
	rid: string,
	proposed: unknown,
	confidence?: number | null,
	exec: BatchDb = db,
): Promise<string> {
	const tenant = forTenant(rid);
	const visible = await exec.select().from(categories)
		.where(tenant.scope(categories.restaurantId, eq(categories.hidden, false)))
		.orderBy(asc(categories.sortOrder), asc(categories.name));
	const visibleByKey = new Map(visible.map((c) => [c.nameKey, c.name]));

	const confident = !(typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < MIN_CATEGORY_CONFIDENCE);
	if (typeof proposed === 'string' && confident) {
		const match = visibleByKey.get(categoryKey(proposed));
		if (match) return match;
	}

	const fallback = resolveCategory(proposed, confidence);
	if (fallback === UNCATEGORIZED_CATEGORY) return UNCATEGORIZED_CATEGORY;
	return visibleByKey.has(categoryKey(fallback)) ? fallback : UNCATEGORIZED_CATEGORY;
}
