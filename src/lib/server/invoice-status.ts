import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, forTenant } from './db';
import { invoices } from './schema';
import { isReviewState, type ReviewState } from '$lib/status';

export type { ReviewState };

const OPEN_REVIEW_STATES: ReviewState[] = ['por_revisar', 'incidencia'];

export function invoiceReviewFilter(state: string): SQL | undefined {
	if (!state) return undefined;
	return isReviewState(state) ? eq(invoices.reviewState, state) : sql`false`;
}

export async function markInvoiceReviewed(id: number, rid: string): Promise<boolean> {
	const tdb = forTenant(rid);
	const rows = await db.update(invoices)
		.set({ reviewState: 'revisado', incidenceKind: null })
		.where(and(
			tdb.scope(invoices.restaurantId, eq(invoices.id, id)),
			inArray(invoices.reviewState, OPEN_REVIEW_STATES),
		))
		.returning({ id: invoices.id });
	return rows.length > 0;
}

export async function markInvoicesReviewedBulk(ids: number[], rid: string): Promise<number> {
	if (ids.length === 0) return 0;
	const tdb = forTenant(rid);
	const rows = await db.update(invoices)
		.set({ reviewState: 'revisado', incidenceKind: null })
		.where(and(
			tdb.scope(invoices.restaurantId),
			inArray(invoices.id, ids),
			inArray(invoices.reviewState, OPEN_REVIEW_STATES),
		))
		.returning({ id: invoices.id });
	return rows.length;
}
