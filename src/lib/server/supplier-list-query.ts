import { and, eq, exists, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db, forTenant } from './db';
import { invoiceLineItems, invoices, products, supplierMetrics, suppliers } from './schema';
import { UNCATEGORIZED_CATEGORY } from '../constants';
import type { SupplierListParams, SupplierSortKey } from '../supplier-list';

type TenantScope = ReturnType<typeof forTenant>;

export function supplierCategoryExpr(): SQL<string> {
	return sql<string>`COALESCE(${suppliers.category}, ${UNCATEGORIZED_CATEGORY})`;
}

export function supplierTotalSpendExpr(): SQL<number> {
	return sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)`;
}

export function supplierLastInvoiceExpr(): SQL<string | null> {
	return sql<string | null>`MAX(${invoices.invoiceDate})`;
}

export function supplierReliabilityExpr(): SQL<number | null> {
	return sql<number | null>`CASE WHEN COUNT(${invoices.id}) >= 3 THEN MAX(${supplierMetrics.score}) END`;
}

function supplierNameExpr(): SQL {
	return sql`LOWER(${suppliers.name})`;
}

export function supplierListOrderBy(sort: SupplierSortKey): SQL[] {
	const byName = sql`${supplierNameExpr()} ASC`;
	switch (sort) {
		case 'name_asc':
			return [byName];
		case 'name_desc':
			return [sql`${supplierNameExpr()} DESC`];
		case 'spend_asc':
			return [sql`${supplierTotalSpendExpr()} ASC`, byName];
		case 'last_invoice_desc':
			return [sql`${supplierLastInvoiceExpr()} DESC NULLS LAST`, byName];
		case 'last_invoice_asc':
			return [sql`${supplierLastInvoiceExpr()} ASC NULLS LAST`, byName];
		case 'reliability_desc':
			return [sql`${supplierReliabilityExpr()} DESC NULLS LAST`, byName];
		case 'reliability_asc':
			return [sql`${supplierReliabilityExpr()} ASC NULLS LAST`, byName];
		default:
			return [sql`${supplierTotalSpendExpr()} DESC`, byName];
	}
}

function likeTerm(raw: string): string {
	const escaped = raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
	return `%${escaped}%`;
}

function hasUncategorizedProducts(tdb: TenantScope): SQL {
	return exists(
		db
			.select({ present: sql`1` })
			.from(invoiceLineItems)
			.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
			.innerJoin(products, eq(products.id, invoiceLineItems.productId))
			.where(
				and(
					eq(invoices.supplierId, suppliers.id),
					tdb.scope(invoiceLineItems.restaurantId),
					tdb.scope(invoices.restaurantId),
					tdb.scope(products.restaurantId),
					or(isNull(products.category), eq(products.category, UNCATEGORIZED_CATEGORY)),
				),
			),
	);
}

export function supplierListFilter(tdb: TenantScope, params: SupplierListParams): SQL | undefined {
	const predicates: SQL[] = [];

	if (params.search) {
		const term = likeTerm(params.search);
		const match = or(
			ilike(suppliers.name, term),
			sql`${supplierCategoryExpr()} ILIKE ${term}`,
		);
		if (match) predicates.push(match);
	}

	if (params.category) {
		predicates.push(sql`${supplierCategoryExpr()} = ${params.category}`);
	}

	if (params.uncategorizedOnly) {
		predicates.push(hasUncategorizedProducts(tdb));
	}

	return predicates.length ? and(...predicates) : undefined;
}
