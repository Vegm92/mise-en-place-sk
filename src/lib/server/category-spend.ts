import { and, eq, exists, notExists, or, sql, type SQL } from 'drizzle-orm';
import { db, forTenant } from './db';
import { invoiceLineItems, invoices, products, suppliers } from './schema';
import { selectableCategoryNames } from './categories';
import { moneyToNumber } from './money';
import { UNCATEGORIZED_CATEGORY } from '../constants';

export function lineCategoryExpr(): SQL<string> {
	return sql<string>`COALESCE(NULLIF(${invoiceLineItems.categoryOverride}, ''), ${products.category}, ${suppliers.category}, 'Other')`;
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

export async function uncategorizedSummary(
	rid: string,
	from: string,
	to: string,
): Promise<{ count: number; amount: number }> {
	const rows = await db.execute<{ count: number; amount: string | null }>(sql`
		SELECT COUNT(*)::int AS count, SUM(${lineAmountExpr()}) AS amount
		FROM invoice_line_items
		JOIN invoices i ON i.id = invoice_line_items.invoice_id
		LEFT JOIN suppliers ON suppliers.id = i.supplier_id
		${lineProductJoin()}
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND ${describedLine()}
		  AND i.invoice_date >= ${from}::date AND i.invoice_date <= ${to}::date
		  AND ${lineCategoryExpr()} = ${UNCATEGORIZED_CATEGORY}
	`);
	return { count: Number(rows[0]?.count ?? 0), amount: moneyToNumber(rows[0]?.amount) };
}

export interface UncategorizedLine {
	id: number;
	description: string;
	supplier: string | null;
	invoiceNumber: string | null;
	amount: number;
}

export async function listUncategorizedLines(rid: string, limit = 100): Promise<UncategorizedLine[]> {
	const rows = await db.execute<{ id: number; description: string; supplier: string | null; invoice_number: string | null; amount: string | null }>(sql`
		SELECT invoice_line_items.id, invoice_line_items.description, suppliers.name AS supplier,
		       i.invoice_number, ${lineAmountExpr()} AS amount
		FROM invoice_line_items
		JOIN invoices i ON i.id = invoice_line_items.invoice_id
		LEFT JOIN suppliers ON suppliers.id = i.supplier_id
		${lineProductJoin()}
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND ${describedLine()}
		  AND ${lineCategoryExpr()} = ${UNCATEGORIZED_CATEGORY}
		ORDER BY i.invoice_date DESC, invoice_line_items.id
		LIMIT ${limit}
	`);
	return rows.map((r) => ({
		id: r.id,
		description: r.description,
		supplier: r.supplier,
		invoiceNumber: r.invoice_number,
		amount: moneyToNumber(r.amount),
	}));
}

export async function setLineCategory(rid: string, lineId: number, category: string | null): Promise<boolean> {
	const wanted = category && category !== UNCATEGORIZED_CATEGORY ? category : null;
	if (wanted && !(await selectableCategoryNames(rid)).includes(wanted)) return false;
	const updated = await db.update(invoiceLineItems)
		.set({ categoryOverride: wanted })
		.where(forTenant(rid).scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.id, lineId)))
		.returning({ id: invoiceLineItems.id });
	return updated.length > 0;
}
