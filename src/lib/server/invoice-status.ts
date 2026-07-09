/**
 * Guarded invoice status transitions (issue #243).
 *
 * Same pattern as batch-core.ts: every status mutation is an
 * `UPDATE … WHERE status IN (from)` that reports whether it actually fired,
 * so a stale tab or a double-submit becomes a no-op instead of a lost update
 * or a contradiction between `status` and the RD 238/2026 timestamps
 * (accepted_at / rejected_at / paid_at).
 *
 * Allowed transitions:
 *   pending            → accepted | rejected | paid
 *   accepted           → paid
 *   paid               → pending   (markUnpaid — resets the timestamps)
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, forTenant } from './db';
import { invoices } from './schema';

export type InvoiceStatus = 'pending' | 'accepted' | 'rejected' | 'paid';

async function transition(
	id: number,
	rid: string,
	from: InvoiceStatus[],
	set: Partial<typeof invoices.$inferInsert>,
): Promise<boolean> {
	const tdb = forTenant(rid);
	const rows = await db.update(invoices)
		.set(set)
		.where(and(
			tdb.scope(invoices.restaurantId, eq(invoices.id, id)),
			inArray(invoices.status, from),
		))
		.returning({ id: invoices.id });
	return rows.length > 0;
}

/** pending/accepted → paid, recording the payment date. */
export function markInvoicePaid(id: number, rid: string): Promise<boolean> {
	return transition(id, rid, ['pending', 'accepted'], { status: 'paid', paidAt: new Date() });
}

/** paid → pending, clearing the now-stale payment/acceptance timestamps. */
export function markInvoiceUnpaid(id: number, rid: string): Promise<boolean> {
	return transition(id, rid, ['paid'], { status: 'pending', paidAt: null, acceptedAt: null });
}

/** pending → accepted (RD 238/2026 acceptance). */
export function acceptInvoice(id: number, rid: string): Promise<boolean> {
	return transition(id, rid, ['pending'], { status: 'accepted', acceptedAt: new Date() });
}

/** pending → rejected (RD 238/2026 rejection). */
export function rejectInvoice(id: number, rid: string): Promise<boolean> {
	return transition(id, rid, ['pending'], { status: 'rejected', rejectedAt: new Date() });
}

/** Bulk pending/accepted → paid. Returns how many rows actually transitioned. */
export async function markInvoicesPaidBulk(ids: number[], rid: string): Promise<number> {
	if (ids.length === 0) return 0;
	const tdb = forTenant(rid);
	const rows = await db.update(invoices)
		.set({ status: 'paid', paidAt: new Date() })
		.where(and(
			tdb.scope(invoices.restaurantId),
			inArray(invoices.id, ids),
			inArray(invoices.status, ['pending', 'accepted']),
		))
		.returning({ id: invoices.id });
	return rows.length;
}
