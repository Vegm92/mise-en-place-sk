import { and, eq, exists, notExists, or, sql, type SQL } from 'drizzle-orm';
import { db, type forTenant } from './db';
import { invoiceLineItems, invoices, products, suppliers } from './schema';

export function lineCategoryExpr(): SQL<string> {
	return sql<string>`COALESCE(${products.category}, ${suppliers.category}, 'Other')`;
}

export function lineProductJoinOn(): SQL {
	return sql`${products.id} = ${invoiceLineItems.productId} AND ${products.restaurantId} = ${invoiceLineItems.restaurantId}`;
}

export function lineProductJoin(): SQL {
	return sql`LEFT JOIN ${products} ON ${lineProductJoinOn()}`;
}

export function lineAmountExpr(): SQL<string> {
	return sql<string>`COALESCE(${invoiceLineItems.totalPrice}, ${invoiceLineItems.unitPrice} * ${invoiceLineItems.quantity}, 0)`;
}

export function describedLine(): SQL {
	return sql`${invoiceLineItems.description} IS NOT NULL AND ${invoiceLineItems.description} <> ''`;
}

type TenantScope = ReturnType<typeof forTenant>;

export function invoiceMatchesCategory(tdb: TenantScope, category: string): SQL {
	const lineMatch = exists(
		db.select({ present: sql`1` })
			.from(invoiceLineItems)
			.leftJoin(products, lineProductJoinOn())
			.where(and(
				eq(invoiceLineItems.invoiceId, invoices.id),
				tdb.scope(invoiceLineItems.restaurantId),
				describedLine(),
				eq(lineCategoryExpr(), category),
			)),
	);
	const noDescribedLines = notExists(
		db.select({ present: sql`1` })
			.from(invoiceLineItems)
			.where(and(
				eq(invoiceLineItems.invoiceId, invoices.id),
				tdb.scope(invoiceLineItems.restaurantId),
				describedLine(),
			)),
	);
	const supplierFallbackMatch = sql`COALESCE(${suppliers.category}, 'Other') = ${category}`;
	return or(lineMatch, and(noDescribedLines, supplierFallbackMatch))!;
}
