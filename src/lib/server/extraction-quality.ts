import { db } from './db';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
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

export interface FuzzyMatchOutcomes {
	total: number;
	confirmed: number;
	rejected: number;
	pending: number;
	accuracyRate: number | null;
}

export interface PromptVersionCorrections {
	promptVersion: string;
	invoices: number;
	corrections: number;
	correctionRate: number | null;
}

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
	// tenant-scope-ok: admin rollup of correction volume by field across every
	// tenant — the point is spotting which fields the model gets wrong most.
	const rows = await db
		.select({
			fieldName: extractionCorrections.fieldName,
			corrections: count(),
			avgConfidence: sql<number | null>`avg(${extractionCorrections.fieldConfidence})`,
		})
		.from(extractionCorrections)
		.where(sql`${extractionCorrections.correctedAt} > now() - (${days} * interval '1 day')`)
		.groupBy(extractionCorrections.fieldName)
		.orderBy(desc(count()))
		.limit(MAX_ROWS);
	return rows.map(r => ({ ...r, avgConfidence: r.avgConfidence !== null ? Number(r.avgConfidence) : null }));
}

export async function correctionsBySupplier(days = DEFAULT_WINDOW_DAYS): Promise<SupplierCorrectionRow[]> {
	// tenant-scope-ok: admin rollup of correction volume by supplier across
	// every tenant — surfaces suppliers whose extractions need more fixing.
	return db
		.select({
			supplierId: extractionCorrections.supplierId,
			supplierName: suppliers.name,
			restaurantName: restaurants.name,
			corrections: count(),
		})
		.from(extractionCorrections)
		.leftJoin(suppliers, eq(suppliers.id, extractionCorrections.supplierId))
		.leftJoin(restaurants, eq(restaurants.id, extractionCorrections.restaurantId))
		.where(sql`${extractionCorrections.correctedAt} > now() - (${days} * interval '1 day')`)
		.groupBy(extractionCorrections.supplierId, suppliers.name, restaurants.name)
		.orderBy(desc(count()))
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
	// tenant-scope-ok: admin rollup of correction volume over time across
	// every tenant — a platform-wide trend, not a per-restaurant one.
	return db
		.select({ week: weekExpr, corrections: count() })
		.from(extractionCorrections)
		.where(sql`${extractionCorrections.correctedAt} > now() - (${weeks} * interval '1 week')`)
		.groupBy(weekExpr)
		.orderBy(asc(weekExpr));
}

export async function productMatchingStats(): Promise<AliasSourceStat[]> {
	// tenant-scope-ok: admin rollup of alias-matching activity by source
	// across every tenant — auto-merge accuracy is a platform-wide question.
	return db
		.select({
			source: productAliases.source,
			total: count(),
			pending: sql<number>`count(*) filter (where ${productAliases.confirmedAt} is null)::int`,
		})
		.from(productAliases)
		.groupBy(productAliases.source)
		.orderBy(desc(count()));
}

export async function fuzzyMatchOutcomes(): Promise<FuzzyMatchOutcomes> {
	const rows = await db.execute(sql`
		SELECT
			count(*) filter (where original_source = 'fuzzy')::int AS total,
			count(*) filter (where original_source = 'fuzzy' and review_outcome = 'confirmed')::int AS confirmed,
			count(*) filter (where original_source = 'fuzzy' and review_outcome = 'rejected')::int AS rejected,
			count(*) filter (where original_source = 'fuzzy' and review_outcome is null)::int AS pending
		FROM product_aliases
	`) as unknown as Array<{ total: number; confirmed: number; rejected: number; pending: number }>;
	const r = rows[0];
	const total = Number(r?.total ?? 0);
	const confirmed = Number(r?.confirmed ?? 0);
	const rejected = Number(r?.rejected ?? 0);
	const pending = Number(r?.pending ?? 0);
	const reviewed = confirmed + rejected;
	return { total, confirmed, rejected, pending, accuracyRate: reviewed > 0 ? confirmed / reviewed : null };
}

export async function correctionsByPromptVersion(): Promise<PromptVersionCorrections[]> {
	const rows = await db.execute(sql`
		WITH invoice_prompt AS (
			SELECT DISTINCT ON (i.id) i.id AS invoice_id, er.prompt_version
			FROM invoices i
			JOIN extraction_results er
				ON er.restaurant_id = i.restaurant_id
				AND er.file_key = i.source_file
				AND er.run_kind = 'live'
			WHERE i.source_file IS NOT NULL
			ORDER BY i.id, er.created_at DESC
		)
		SELECT
			ip.prompt_version,
			count(DISTINCT ip.invoice_id)::int AS invoices,
			count(ec.id)::int AS corrections
		FROM invoice_prompt ip
		LEFT JOIN extraction_corrections ec ON ec.invoice_id = ip.invoice_id
		GROUP BY ip.prompt_version
		ORDER BY ip.prompt_version DESC
	`) as unknown as Array<{ prompt_version: string; invoices: number; corrections: number }>;
	return rows.map(r => {
		const invoicesCount = Number(r.invoices);
		const corrections = Number(r.corrections);
		return {
			promptVersion: r.prompt_version,
			invoices: invoicesCount,
			corrections,
			correctionRate: invoicesCount > 0 ? corrections / invoicesCount : null,
		};
	});
}

export async function pendingFuzzyMatches(limit = MAX_ROWS): Promise<PendingFuzzyMatch[]> {
	// tenant-scope-ok: admin review queue of fuzzy auto-merges awaiting human
	// confirmation across every tenant, capped to a small page of oldest rows.
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
