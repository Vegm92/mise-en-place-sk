import { eq, and, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export function forTenant(restaurantId: string) {
	if (!restaurantId) throw new Error('forTenant: restaurantId is required');
	return {
		rid: restaurantId,
		scope(ridCol: AnyPgColumn, extra?: SQL): SQL {
			const base = eq(ridCol, restaurantId);
			return extra ? and(base, extra)! : base;
		},
	} as const;
}
