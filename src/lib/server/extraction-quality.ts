import { db } from './db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { extractionCorrections, suppliers, restaurants, productAliases, products } from './schema';

const DEFAULT_WINDOW_DAYS = 30;
const TREND_WEEKS = 8;
const MAX_ROWS = 20;

export interface LearningSummary {
	windowDays: number;
	totalCorrections: number;
	totalInvoices: number;
	correctionRate: number | null;
}

export interface FieldCorrectionRow {
	fieldName: string;
	corrections: number;
	avgConfidence: number | null;
}

export interface SupplierCorrectionRow {
	supplierId: number | null;
	supplierName: string | null;
	restaurantName: string | null;
	corrections: number;
}

export interface TenantCorrectionRow {
	restaurantId: string;
	restaurantName: string;
	corrections: number;
	invoices: number;
	rate: number | null;
}

export interface CorrectionTrendPoint {
	week: string;
	corrections: number;
}

export interface AliasSourceStat {
	source: string;
	total: number;
	pending: number;
}

export interface PendingFuzzyMatch {
	id: number;
	productName: string;
	restaurantName: string | null;
	rawText: string | null;
	createdAt: string;
}

// tenant-scope-ok: admin observability rollups across every tenant's extraction
// corrections and product matching activity; reachable only from the (admin)
// route group, which isAdminUser() already gates.

export async function learningSummary(days = DEFAULT_WINDOW_DAYS): Promise<LearningSummary> {
	const rows = await db.execute(sql`
		SELECT
			(SELECT COUNT(*) FROM extraction_corrections
				WHERE corrected_at > now() - (${days} * interval '1 day')) AS corrections,
			(SELECT COUNT(*) FROM invoices
				WHERE created_at > now() - (${days} * interval '1 day')) AS invoices
	`) as unknown as Array<{ corrections: string; invoices: string }>;
	const r = rows[0];
	const corrections = Number(r?.corrections ?? 0);
	const invoicesCount = Number(r?.invoices ?? 0);
	return {
		windowDays: days,
		totalCorrections: corrections,
		totalInvoices: invoicesCount,
		correctionRate: invoicesCount > 0 ? corrections / invoicesCount : null,
	};
}

export async function correctionsByField(days = DEFAULT_WINDOW_DAYS): Promise<FieldCorrectionRow[]> {
	const rows = await db
		.select({
			fieldName: extractionCorrections.fieldName,
			corrections: sql<number>`count(*)::int`,
			avgConfidence: sql<number | null>`avg(${extractionCorrections.fieldConfidence})`,
		})
		.from(extractionCorrections)
		.where(sql`${extractionCorrections.correctedAt} > now() - (${days} * interval '1 day')`)
		.groupBy(extractionCorrections.fieldName)
		.orderBy(desc(sql`count(*)`))
		.limit(MAX_ROWS);
	return rows.map(r => ({ ...r, avgConfidence: r.avgConfidence !== null ? Number(r.avgConfidence) : null }));
}

export async function correctionsBySupplier(days = DEFAULT_WINDOW_DAYS): Promise<SupplierCorrectionRow[]> {
	return db
		.select({
			supplierId: extractionCorrections.supplierId,
			supplierName: suppliers.name,
			restaurantName: restaurants.name,
			corrections: sql<number>`count(*)::int`,
		})
		.from(extractionCorrections)
		.leftJoin(suppliers, eq(suppliers.id, extractionCorrections.supplierId))
		.leftJoin(restaurants, eq(restaurants.id, extractionCorrections.restaurantId))
		.where(sql`${extractionCorrections.correctedAt} > now() - (${days} * interval '1 day')`)
		.groupBy(extractionCorrections.supplierId, suppliers.name, restaurants.name)
		.orderBy(desc(sql`count(*)`))
		.limit(MAX_ROWS);
}

export async function correctionsByTenant(days = DEFAULT_WINDOW_DAYS): Promise<TenantCorrectionRow[]> {
	const rows = await db.execute(sql`
		SELECT r.id AS restaurant_id, r.name AS restaurant_name,
			COUNT(ec.id)::int AS corrections,
			(SELECT COUNT(*) FROM invoices i WHERE i.restaurant_id = r.id
				AND i.created_at > now() - (${days} * interval '1 day'))::int AS invoices
		FROM extraction_corrections ec
		JOIN restaurants r ON r.id = ec.restaurant_id
		WHERE ec.corrected_at > now() - (${days} * interval '1 day')
		GROUP BY r.id, r.name
		ORDER BY corrections DESC
		LIMIT ${MAX_ROWS}
	`) as unknown as Array<{ restaurant_id: string; restaurant_name: string; corrections: number; invoices: number }>;
	return rows.map(r => {
		const corrections = Number(r.corrections);
		const invoicesCount = Number(r.invoices);
		return {
			restaurantId: r.restaurant_id,
			restaurantName: r.restaurant_name,
			corrections,
			invoices: invoicesCount,
			rate: invoicesCount > 0 ? corrections / invoicesCount : null,
		};
	});
}

export async function correctionsTrend(weeks = TREND_WEEKS): Promise<CorrectionTrendPoint[]> {
	const weekExpr = sql<string>`date_trunc('week', ${extractionCorrections.correctedAt})::date`;
	return db
		.select({ week: weekExpr, corrections: sql<number>`count(*)::int` })
		.from(extractionCorrections)
		.where(sql`${extractionCorrections.correctedAt} > now() - (${weeks} * interval '1 week')`)
		.groupBy(weekExpr)
		.orderBy(asc(weekExpr));
}

export async function productMatchingStats(): Promise<AliasSourceStat[]> {
	return db
		.select({
			source: productAliases.source,
			total: sql<number>`count(*)::int`,
			pending: sql<number>`count(*) filter (where ${productAliases.confirmedAt} is null)::int`,
		})
		.from(productAliases)
		.groupBy(productAliases.source)
		.orderBy(desc(sql`count(*)`));
}

export async function pendingFuzzyMatches(limit = MAX_ROWS): Promise<PendingFuzzyMatch[]> {
	const rows = await db
		.select({
			id: productAliases.id,
			productName: products.canonicalName,
			restaurantName: restaurants.name,
			rawText: productAliases.rawText,
			createdAt: productAliases.createdAt,
		})
		.from(productAliases)
		.innerJoin(products, eq(products.id, productAliases.productId))
		.leftJoin(restaurants, eq(restaurants.id, productAliases.restaurantId))
		.where(and(eq(productAliases.source, 'fuzzy'), sql`${productAliases.confirmedAt} is null`))
		.orderBy(asc(productAliases.createdAt))
		.limit(limit);
	return rows.map(r => ({ ...r, createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '' }));
}
