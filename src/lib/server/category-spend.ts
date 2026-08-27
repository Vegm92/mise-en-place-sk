import { sql, type SQL } from 'drizzle-orm';
import { invoiceLineItems, products, suppliers } from './schema';

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
