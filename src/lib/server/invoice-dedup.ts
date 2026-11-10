import { and, eq, isNull, ne } from 'drizzle-orm';
import { invoices } from './schema';
import type { forTenant } from './db';
import type { BatchDb } from './batch';

type TenantScope = ReturnType<typeof forTenant>;

export type DuplicateOutcome =
	| { type: 'contentDuplicate'; duplicateId: number }
	| { type: 'numberDuplicate' };

export async function findContentHashDuplicate(
	tx: BatchDb,
	tdb: TenantScope,
	contentHash: string,
	excludeInvoiceId?: number,
): Promise<number | null> {
	const dup = await tx
		.select({ id: invoices.id })
		.from(invoices)
		.where(and(
			tdb.scope(invoices.restaurantId),
			eq(invoices.contentHash, contentHash),
			isNull(invoices.deletedAt),
			excludeInvoiceId === undefined ? undefined : ne(invoices.id, excludeInvoiceId),
		))
		.limit(1);
	return dup.length > 0 ? dup[0]!.id : null;
}

async function invoiceNumberTaken(
	tx: BatchDb,
	tdb: TenantScope,
	supplierId: number,
	invoiceNumber: string,
	excludeInvoiceId?: number,
): Promise<boolean> {
	const dup = await tx
		.select({ id: invoices.id })
		.from(invoices)
		.where(and(
			tdb.scope(invoices.restaurantId),
			eq(invoices.supplierId, supplierId),
			eq(invoices.invoiceNumber, invoiceNumber),
			isNull(invoices.deletedAt),
			excludeInvoiceId === undefined ? undefined : ne(invoices.id, excludeInvoiceId),
		))
		.limit(1);
	return dup.length > 0;
}

export async function findInvoiceDuplicate(
	tx: BatchDb,
	tdb: TenantScope,
	check: { contentHash: string; supplierId: number | null; invoiceNumber: string | null; excludeInvoiceId?: number },
): Promise<DuplicateOutcome | null> {
	const hashDuplicateId = await findContentHashDuplicate(tx, tdb, check.contentHash, check.excludeInvoiceId);
	if (hashDuplicateId !== null) return { type: 'contentDuplicate', duplicateId: hashDuplicateId };
	if (check.supplierId !== null && check.invoiceNumber
		&& await invoiceNumberTaken(tx, tdb, check.supplierId, check.invoiceNumber, check.excludeInvoiceId)) {
		return { type: 'numberDuplicate' };
	}
	return null;
}
