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

export function markInvoicePaid(id: number, rid: string): Promise<boolean> {
	return transition(id, rid, ['pending', 'accepted'], { status: 'paid', paidAt: new Date() });
}

export function markInvoiceUnpaid(id: number, rid: string): Promise<boolean> {
	return transition(id, rid, ['paid'], { status: 'pending', paidAt: null, acceptedAt: null });
}

export function acceptInvoice(id: number, rid: string): Promise<boolean> {
	return transition(id, rid, ['pending'], { status: 'accepted', acceptedAt: new Date() });
}

export function rejectInvoice(id: number, rid: string): Promise<boolean> {
	return transition(id, rid, ['pending'], { status: 'rejected', rejectedAt: new Date() });
}

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
