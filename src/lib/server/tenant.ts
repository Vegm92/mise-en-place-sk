/**
 * Tenant-scoped query context — no DB connection dependency.
 * See ARCHITECTURE_DECISIONS.md ADR-001.
 */
import { eq, and, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Returns a tenant-scoped query context. Use in all route handlers instead
 * of building raw `eq(table.restaurantId, rid)` inline.
 *
 * @example
 *   const tdb = forTenant(locals.restaurantId);
 *   const rows = await db.select().from(suppliers).where(tdb.scope(suppliers.restaurantId));
 *   // With extra conditions:
 *   const paid = await db.select().from(invoices)
 *     .where(tdb.scope(invoices.restaurantId, eq(invoices.status, 'paid')));
 */
export function forTenant(restaurantId: string) {
	if (!restaurantId) throw new Error('forTenant: restaurantId is required');
	return {
		rid: restaurantId,
		/** Builds a WHERE condition that always scopes to this tenant. */
		scope(ridCol: AnyPgColumn, extra?: SQL): SQL {
			const base = eq(ridCol, restaurantId);
			return extra ? and(base, extra)! : base;
		},
	} as const;
}
