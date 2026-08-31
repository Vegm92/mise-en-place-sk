import type { PgBoss } from 'pg-boss';
import { and, eq, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/sveltekit';
import { db, forTenant, runAsSystem } from './db';
import { invoiceLineItems, invoices, products, suppliers, stockLevels, categoryBudgets, settings, systemNotifications, userRestaurants } from './schema';
import { users } from './schema';
import { renderTemplate } from '$lib/i18n-messages';
import { toMonthStr } from '$lib/formatters';
import { UNCATEGORIZED_CATEGORY, VALID_CATEGORIES } from '$lib/constants';
import { normalizeProductKey } from './normalize';
import { parsePack, normalizedUnitPrice, type EnrichedLineItem } from './products';
import { moneyToNumber, moneyToNullableNumber } from './money';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoinOn } from './category-spend';
import { sendEmail, weeklyDigestEmail, incidenciaDigestEmail, trialExpiryEmail, trialExpiredEmail } from './email';
import { parseQrUrl, detectVerifactuMismatch } from './qr';
import { getOrGenerateWeeklyDigest, isoWeek } from './weekly-digest';
import { TIERS, effectiveTier, ORPHAN_SUBSCRIPTIONS_CRON, ORPHAN_SUBSCRIPTIONS_QUEUE, runOrphanSubscriptionsJob } from './billing';
import { getStorage } from './storage';
import { MRR_SNAPSHOT_CRON, MRR_SNAPSHOT_QUEUE, runMrrSnapshotJob } from './revenue-metrics';
import { purgeDeadLetters, recordDeadLetter } from './dead-letter';
import { sweepIdempotencyKeys } from './idempotency';
import { filterEnabledAlerts, isAlertEnabled } from './alert-preferences';
import {
	dispatchTenantJobs,
	registerTenantFanout,
	type DispatchResult,
	type TenantJobData,
} from './tenant-fanout';

const LOW_STOCK_DAYS = 3;
const UNIT_PRICE = 'unitPrice';
const NORMALIZED_UNIT_PRICE = 'normalizedUnitPrice';
const BASE_UNIT = 'baseUnit';
const MESSAGE_KEY = 'messageKey';
const MESSAGE_VARS = 'messageVars';

export interface Alert {
	notificationType: string;
	message: string;
	payload: Record<string, unknown>;
}

type PricePoint = { unitPrice: number; normalizedUnitPrice: number | null; baseUnit: string | null };

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor((sorted.length - 1) / 2)];
}

function buildPriceHistory<K, R extends { unitPrice: string; normalizedUnitPrice: string | null; baseUnit: string | null }>(
	rows: R[],
	getKey: (row: R) => K,
): Map<K, PricePoint> {
	const history = new Map<K, PricePoint[]>();
	for (const row of rows) {
		const point = { unitPrice: moneyToNumber(row.unitPrice), normalizedUnitPrice: moneyToNullableNumber(row.normalizedUnitPrice), baseUnit: row.baseUnit };
		const key = getKey(row);
		const arr = history.get(key);
		if (arr) arr.push(point); else history.set(key, [point]);
	}
	const map = new Map<K, PricePoint>();
	for (const [key, points] of history) map.set(key, collapseHistory(points));
	return map;
}

function collapseHistory(points: PricePoint[]): PricePoint {
	if (points.length === 1) return points[0];
	const unitPrice = median(points.map(p => p.unitPrice));
	const baseUnit = points[0].baseUnit;
	const sameBaseUnit = baseUnit != null && points.every(p => p.baseUnit === baseUnit && p.normalizedUnitPrice != null);
	const normalizedUnitPrice = sameBaseUnit ? median(points.map(p => p.normalizedUnitPrice!)) : null;
	return { unitPrice, normalizedUnitPrice, baseUnit: sameBaseUnit ? baseUnit : null };
}

const PRICE_HISTORY_WINDOW = 3;

async function loadKeyPriceHistory(
	restaurantId: string,
	supplierName: string,
	itemKeys: string[],
	invoiceId: number,
): Promise<Map<string, PricePoint>> {
	const priceRows = await db.execute<{ itemKey: string; unitPrice: string; normalizedUnitPrice: string | null; baseUnit: string | null }>(sql`
		SELECT "itemKey", "unitPrice", "normalizedUnitPrice", "baseUnit" FROM (
			SELECT
				mep_norm_key(ili.description) AS "itemKey",
				ili.unit_price AS "unitPrice",
				ili.normalized_unit_price AS "normalizedUnitPrice",
				ili.base_unit AS "baseUnit",
				ROW_NUMBER() OVER (
					PARTITION BY mep_norm_key(ili.description)
					ORDER BY i.invoice_date DESC, i.id DESC
				) AS rn
			FROM invoice_line_items ili
			INNER JOIN invoices i ON ili.invoice_id = i.id
			INNER JOIN suppliers s ON i.supplier_id = s.id
			WHERE i.restaurant_id = ${restaurantId}
				AND mep_norm_key(ili.description) IN (${sql.join(itemKeys.map(d => sql`${d}`), sql`, `)})
				AND s.name = ${supplierName}
				AND ili.invoice_id != ${invoiceId}
				AND ili.unit_price IS NOT NULL
				AND i.deleted_at IS NULL
		) ranked
		WHERE rn <= ${PRICE_HISTORY_WINDOW}
	`);

	return buildPriceHistory(priceRows, r => r.itemKey);
}

async function loadProductPriceHistory(
	restaurantId: string,
	supplierName: string,
	productByKey: Map<string, number> | undefined,
	invoiceId: number,
): Promise<Map<number, PricePoint>> {
	const productIds = productByKey ? [...new Set(productByKey.values())] : [];
	const map = new Map<number, PricePoint>();
	if (productIds.length === 0) return map;

	const productRows = await db.execute<{ productId: number; unitPrice: string; normalizedUnitPrice: string | null; baseUnit: string | null }>(sql`
		SELECT "productId", "unitPrice", "normalizedUnitPrice", "baseUnit" FROM (
			SELECT
				ili.product_id AS "productId",
				ili.unit_price AS "unitPrice",
				ili.normalized_unit_price AS "normalizedUnitPrice",
				ili.base_unit AS "baseUnit",
				ROW_NUMBER() OVER (
					PARTITION BY ili.product_id
					ORDER BY i.invoice_date DESC, i.id DESC
				) AS rn
			FROM invoice_line_items ili
			INNER JOIN invoices i ON ili.invoice_id = i.id
			INNER JOIN suppliers s ON i.supplier_id = s.id
			WHERE i.restaurant_id = ${restaurantId}
				AND ili.product_id IN (${sql.join(productIds.map(p => sql`${p}`), sql`, `)})
				AND s.name = ${supplierName}
				AND ili.invoice_id != ${invoiceId}
				AND ili.unit_price IS NOT NULL
				AND i.deleted_at IS NULL
		) ranked
		WHERE rn <= ${PRICE_HISTORY_WINDOW}
	`);

	return buildPriceHistory(productRows, r => r.productId);
}

function determinePriceComparison(
	newPrice: number,
	newNorm: number | null,
	baseline: PricePoint,
	newPack: ReturnType<typeof parsePack>,
): { useNorm: boolean; oldCmp: number; newCmp: number } {
	const useNorm = newNorm != null && baseline.normalizedUnitPrice != null && baseline.normalizedUnitPrice > 0
		&& newPack != null && baseline.baseUnit != null && newPack.baseUnit === baseline.baseUnit;

	const oldCmp = useNorm ? baseline.normalizedUnitPrice! : baseline.unitPrice;
	const newCmp = useNorm ? newNorm! : newPrice;

	return { useNorm, oldCmp, newCmp };
}

function evaluatePriceShock(
	item: EnrichedLineItem,
	supplierName: string,
	productByKey: Map<string, number> | undefined,
	keyPriceMap: Map<string, PricePoint>,
	productPriceMap: Map<number, PricePoint>,
	threshold: number,
): Alert | null {
	const description = (item.description ?? '').trim();
	const newPrice = item.unitPrice;
	if (!description || newPrice == null) return null;

	const key = normalizeProductKey(description);
	const pid = productByKey?.get(key);
	const prev = pid != null ? productPriceMap.get(pid) : undefined;
	const baseline = prev ?? keyPriceMap.get(key);
	if (!baseline) return null;

	const newPack = parsePack(description, item.unit);
	const newNorm = normalizedUnitPrice(newPrice, newPack);
	const comparison = determinePriceComparison(newPrice, newNorm, baseline, newPack);

	const { useNorm, oldCmp, newCmp } = comparison;
	if (oldCmp === 0) return null;

	const deviation = (newCmp - oldCmp) / oldCmp;
	if (Math.abs(deviation) < threshold) return null;

	const pct = Math.round(deviation * 1000) / 10;
	const unitSuffix = useNorm ? ` €/${newPack!.baseUnit}` : '';
	const basis = useNorm
		? { label: 'per_base_unit' as const, unit: newPack!.baseUnit }
		: { label: 'per_unit' as const, unit: null };
	const messageKey = deviation > 0 ? 'notif.msg.priceShockUp' : 'notif.msg.priceShockDown';
	const messageVars = { ingredient: description, pct: Math.abs(pct), oldPrice: oldCmp.toFixed(2), newPrice: newCmp.toFixed(2), unitSuffix };

	return {
		notificationType: 'price_shock',
		message: renderTemplate('es', messageKey, messageVars),
		payload: {
			ingredient: description, supplier: supplierName, oldPrice: oldCmp, newPrice: newCmp, deviationPct: pct, basis: basis.label, baseUnit: basis.unit,
			messageKey,
			messageVars,
		},
	};
}

export async function runPriceShock(
	invoiceId: number,
	supplierName: string,
	lineItems: EnrichedLineItem[],
	restaurantId: string,
	productByKey?: Map<string, number>,
): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);

	const thresholdRows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, 'price_alert_threshold')))
		.limit(1);
	const threshold = thresholdRows[0] ? parseFloat(thresholdRows[0].value) : 0.15;

	const itemKeys = [...new Set(lineItems.map(i => normalizeProductKey(i.description ?? '')).filter(Boolean))];
	if (itemKeys.length === 0) return [];

	const keyPriceMap = await loadKeyPriceHistory(restaurantId, supplierName, itemKeys, invoiceId);
	const productPriceMap = await loadProductPriceHistory(restaurantId, supplierName, productByKey, invoiceId);

	const alerts: Alert[] = [];
	for (const item of lineItems) {
		const alert = evaluatePriceShock(item, supplierName, productByKey, keyPriceMap, productPriceMap, threshold);
		if (alert) alerts.push(alert);
	}

	return alerts;
}

export async function runStockForecast(lineItems: EnrichedLineItem[], restaurantId: string): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);
	const alerts: Alert[] = [];

	const itemKeys = [...new Set(lineItems.map(i => normalizeProductKey(i.description ?? '')).filter(Boolean))];
	if (itemKeys.length === 0) return [];

	const itemKeyList = sql.join(itemKeys.map(k => sql`${k}`), sql`, `);
	const stockRows = await db
		.select({
			ingredient: stockLevels.ingredient,
			currentStock: stockLevels.currentStock,
			dailyBurnRate: stockLevels.dailyBurnRate,
			canonicalUnit: stockLevels.canonicalUnit,
		})
		.from(stockLevels)
		.where(and(
			tdb.scope(stockLevels.restaurantId),
			sql`mep_norm_key(${stockLevels.ingredient}) IN (${itemKeyList})`,
		));

	const stockMap = new Map(stockRows.map(r => [normalizeProductKey(r.ingredient), r]));

	for (const item of lineItems) {
		const description = (item.description ?? '').trim();
		if (!description) continue;

		const row = stockMap.get(normalizeProductKey(description));
		if (row?.currentStock == null || row.dailyBurnRate == null || row.dailyBurnRate === 0) continue;

		const addedQty = item.convertedQuantity ?? item.quantity ?? 0;
		const projectedStock = row.currentStock + addedQty;
		const daysRemaining = projectedStock / row.dailyBurnRate;

		if (daysRemaining >= LOW_STOCK_DAYS) continue;

		const lowStockVars = { ingredient: description, days: daysRemaining.toFixed(1) };
		alerts.push({
			notificationType: 'low_stock_forecast',
			message: renderTemplate('es', 'notif.msg.lowStock', lowStockVars),
			payload: {
				ingredient: description,
				projectedDays: Math.round(daysRemaining * 10) / 10,
				currentStock: row.currentStock,
				addedQuantity: addedQty,
				dailyBurnRate: row.dailyBurnRate,
				unit: row.canonicalUnit,
				messageKey: 'notif.msg.lowStock',
				messageVars: lowStockVars,
			},
		});
	}

	return alerts;
}

export async function runCategorizationNudge(
	invoiceId: number,
	supplierId: number,
	restaurantId: string,
): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);

	const [supplier] = await db
		.select({ name: suppliers.name, category: suppliers.category })
		.from(suppliers)
		.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, supplierId)))
		.limit(1);
	if (!supplier) return [];
	if (supplier.category && supplier.category !== UNCATEGORIZED_CATEGORY) return [];

	const [countRow] = await db
		.select({ cnt: sql<number>`COUNT(*)::int` })
		.from(invoices)
		.where(tdb.scope(invoices.restaurantId, and(
			eq(invoices.supplierId, supplierId),
			isNull(invoices.deletedAt),
		)));
	if ((countRow?.cnt ?? 0) > 1) return [];

	const existing = await db
		.select({ payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(and(
			tdb.scope(systemNotifications.restaurantId),
			eq(systemNotifications.notificationType, 'supplier_uncategorized'),
		));
	for (const row of existing) {
		if ((row.payload as { supplierId?: number } | null)?.supplierId === supplierId) return [];
	}

	const uncategorizedVars = { supplier: supplier.name };
	return [{
		notificationType: 'supplier_uncategorized',
		message: renderTemplate('es', 'notif.msg.uncategorized', uncategorizedVars),
		payload: {
			supplierId,
			supplierName: supplier.name,
			messageKey: 'notif.msg.uncategorized',
			messageVars: uncategorizedVars,
		},
	}];
}

export const DOMINANT_CATEGORY_SHARE = 0.5;

export async function dominantSupplierLineCategory(
	supplierId: number,
	restaurantId: string,
): Promise<string | null> {
	const tdb = forTenant(restaurantId);
	const categoryExpr = lineCategoryExpr();
	const rows = await db
		.select({
			category: categoryExpr,
			total: sql<string>`COALESCE(SUM(${lineAmountExpr()}), 0)`,
		})
		.from(invoiceLineItems)
		.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.leftJoin(products, lineProductJoinOn())
		.where(and(
			tdb.scope(invoices.restaurantId),
			eq(invoices.supplierId, supplierId),
			isNull(invoices.deletedAt),
			describedLine(),
		))
		.groupBy(categoryExpr);

	let total = 0;
	let best: { category: string; amount: number } | null = null;
	for (const row of rows) {
		const amount = moneyToNumber(row.total);
		total += amount;
		if (!best || amount > best.amount) best = { category: String(row.category), amount };
	}
	if (!best || total <= 0) return null;
	if (best.category === UNCATEGORIZED_CATEGORY) return null;
	if (!VALID_CATEGORIES.includes(best.category)) return null;
	return best.amount / total >= DOMINANT_CATEGORY_SHARE ? best.category : null;
}

export async function runCategorySuggestion(
	supplierId: number,
	restaurantId: string,
	proposedCategory: string,
): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);

	const [supplier] = await db
		.select({ name: suppliers.name, category: suppliers.category })
		.from(suppliers)
		.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, supplierId)))
		.limit(1);
	if (!supplier) return [];
	if (supplier.category && supplier.category !== UNCATEGORIZED_CATEGORY) return [];

	const fromExtraction = Boolean(proposedCategory)
		&& proposedCategory !== UNCATEGORIZED_CATEGORY
		&& VALID_CATEGORIES.includes(proposedCategory);
	const category = fromExtraction
		? proposedCategory
		: await dominantSupplierLineCategory(supplierId, restaurantId);
	if (!category) return [];

	const existing = await db
		.select({ payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(and(
			tdb.scope(systemNotifications.restaurantId),
			eq(systemNotifications.notificationType, 'supplier_category_suggested'),
		));
	for (const row of existing) {
		if ((row.payload as { supplierId?: number } | null)?.supplierId === supplierId) return [];
	}

	await db
		.update(systemNotifications)
		.set({ status: 'sent' })
		.where(tdb.scope(
			systemNotifications.restaurantId,
			and(
				eq(systemNotifications.notificationType, 'supplier_uncategorized'),
				eq(systemNotifications.status, 'pending'),
				sql`${systemNotifications.payload}->>'supplierId' = ${String(supplierId)}`,
			),
		));

	const catSuggestedVars = { supplier: supplier.name, category };
	return [{
		notificationType: 'supplier_category_suggested',
		message: renderTemplate('es', 'notif.msg.catSuggested', catSuggestedVars),
		payload: {
			supplierId,
			supplierName: supplier.name,
			suggestedCategory: category,
			source: fromExtraction ? 'extraction' : 'lines',
			messageKey: 'notif.msg.catSuggested',
			messageVars: catSuggestedVars,
		},
	}];
}

function budgetOverageLevel(pctFrac: number, thresholdFrac: number): 'exceeded' | 'warning' | null {
	if (pctFrac >= 1.0) return 'exceeded';
	return pctFrac >= thresholdFrac ? 'warning' : null;
}

async function invoiceLineCategories(
	tdb: ReturnType<typeof forTenant>,
	invoiceId: number,
	supplierId: number,
): Promise<string[]> {
	const categoryExpr = lineCategoryExpr();
	const rows = await db
		.select({ category: categoryExpr })
		.from(invoiceLineItems)
		.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.leftJoin(products, lineProductJoinOn())
		.where(and(
			tdb.scope(invoiceLineItems.restaurantId),
			eq(invoiceLineItems.invoiceId, invoiceId),
			describedLine(),
		))
		.groupBy(categoryExpr);
	if (rows.length > 0) return rows.map((r) => String(r.category));

	const supplierRows = await db
		.select({ category: suppliers.category })
		.from(suppliers)
		.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, supplierId)))
		.limit(1);
	return [supplierRows[0]?.category ?? UNCATEGORIZED_CATEGORY];
}

async function monthlyCategorySpend(
	tdb: ReturnType<typeof forTenant>,
	categories: string[],
): Promise<Map<string, number>> {
	const categoryExpr = lineCategoryExpr();
	const rows = await db
		.select({
			category: categoryExpr,
			total: sql<string>`COALESCE(SUM(${lineAmountExpr()}), 0)`,
		})
		.from(invoiceLineItems)
		.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.leftJoin(products, lineProductJoinOn())
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNull(invoices.deletedAt),
			describedLine(),
			sql`TO_CHAR(${invoices.invoiceDate}, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')`,
		))
		.groupBy(categoryExpr);
	const wanted = new Set(categories);
	const out = new Map<string, number>();
	for (const row of rows) {
		const category = String(row.category);
		if (wanted.has(category)) out.set(category, moneyToNumber(row.total));
	}
	return out;
}

async function sentOveragesThisMonth(tdb: ReturnType<typeof forTenant>): Promise<Set<string>> {
	const monthPrefix = new Date().toISOString().slice(0, 7);
	const rows = await db
		.select({ payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(and(
			tdb.scope(systemNotifications.restaurantId),
			eq(systemNotifications.notificationType, 'budget_overage'),
			sql`TO_CHAR(${systemNotifications.createdAt}, 'YYYY-MM') = ${monthPrefix}`
		));
	const sent = new Set<string>();
	for (const row of rows) {
		const p = row.payload as { category?: string; level?: string } | null;
		if (p?.category && p.level) sent.add(`${p.category}:${p.level}`);
	}
	return sent;
}

export async function runBudgetCheck(invoiceId: number, supplierId: number, restaurantId: string): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);
	const categories = await invoiceLineCategories(tdb, invoiceId, supplierId);
	if (categories.length === 0) return [];

	const currentMonth = toMonthStr(new Date());
	const budgetRows = await db
		.select({ category: categoryBudgets.category, monthlyBudget: categoryBudgets.monthlyBudget })
		.from(categoryBudgets)
		.where(tdb.scope(categoryBudgets.restaurantId, and(
			inArray(categoryBudgets.category, categories),
			eq(categoryBudgets.month, currentMonth),
		)));
	const budgets = new Map<string, number>(
		budgetRows
			.map((r): [string, number] => [r.category, moneyToNumber(r.monthlyBudget)])
			.filter(([, amount]) => amount > 0),
	);
	if (budgets.size === 0) return [];

	const thresholdRows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, 'budget_warning_threshold')))
		.limit(1);
	const thresholdPct = thresholdRows[0] ? parseInt(thresholdRows[0].value, 10) : 80;
	const thresholdFrac = thresholdPct / 100;

	const spendByCategory = await monthlyCategorySpend(tdb, [...budgets.keys()]);

	const alreadySent = await sentOveragesThisMonth(tdb);

	const alerts: Alert[] = [];
	for (const [category, monthlyBudget] of budgets) {
		const totalSpend = spendByCategory.get(category) ?? 0;
		const pctFrac = totalSpend / monthlyBudget;
		const level = budgetOverageLevel(pctFrac, thresholdFrac);
		if (!level || alreadySent.has(`${category}:${level}`)) continue;
		alreadySent.add(`${category}:${level}`);

		const pctDisplay = Math.round(pctFrac * 100);
		const budgetMessageKey = level === 'exceeded' ? 'notif.msg.budgetExceeded' : 'notif.msg.budgetWarning';
		const budgetVars = { category, spent: totalSpend.toFixed(2), budget: monthlyBudget.toFixed(2), pct: pctDisplay, threshold: thresholdPct };
		alerts.push({
			notificationType: 'budget_overage',
			message: renderTemplate('es', budgetMessageKey, budgetVars),
			payload: {
				category,
				spent: totalSpend,
				budget: monthlyBudget,
				pct: pctDisplay,
				threshold: thresholdPct,
				level,
				messageKey: budgetMessageKey,
				messageVars: budgetVars,
			},
		});
	}
	return alerts;
}

const DUPLICATE_DATE_WINDOW_DAYS = 21;
const DUPLICATE_AMOUNT_TOLERANCE = 0.10;
const CONFIDENT_LINE_OVERLAP_RATIO = 0.5;

export interface DuplicatePurchaseResult {
	alerts: Alert[];
	linkedInvoiceId: number | null;
}

export interface DuplicatePurchaseInput {
	invoiceId: number;
	supplierId: number;
	supplierName: string;
	restaurantId: string;
	documentType: 'factura' | 'albaran' | null;
	invoiceDate: string | null;
	totalAmount: string | null;
	lineDescriptions?: string[];
}

async function lineOverlapRatio(
	restaurantId: string,
	matchedInvoiceId: number,
	newLineDescriptions: string[],
): Promise<number> {
	const newKeys = new Set(newLineDescriptions.map(normalizeProductKey).filter(Boolean));
	if (newKeys.size === 0) return 0;

	const tdb = forTenant(restaurantId);
	const matchedLines = await db
		.select({ description: invoiceLineItems.description })
		.from(invoiceLineItems)
		.where(tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, matchedInvoiceId)));
	const matchedKeys = new Set(matchedLines.map((l) => normalizeProductKey(l.description ?? '')).filter(Boolean));
	if (matchedKeys.size === 0) return 0;

	let overlap = 0;
	for (const key of newKeys) if (matchedKeys.has(key)) overlap += 1;
	return overlap / Math.min(newKeys.size, matchedKeys.size);
}

export async function runPossibleDuplicatePurchase(
	input: DuplicatePurchaseInput,
): Promise<DuplicatePurchaseResult> {
	const {
		invoiceId, supplierId, supplierName, restaurantId,
		documentType, invoiceDate, totalAmount, lineDescriptions = [],
	} = input;
	if (!documentType || !invoiceDate || totalAmount == null) return { alerts: [], linkedInvoiceId: null };
	const tdb = forTenant(restaurantId);
	const otherType = documentType === 'factura' ? 'albaran' : 'factura';

	const matches = await db
		.select({
			id: invoices.id,
			invoiceNumber: invoices.invoiceNumber,
			invoiceDate: invoices.invoiceDate,
			totalAmount: invoices.totalAmount,
		})
		.from(invoices)
		.where(and(
			tdb.scope(invoices.restaurantId),
			eq(invoices.supplierId, supplierId),
			eq(invoices.documentType, otherType),
			ne(invoices.id, invoiceId),
			isNull(invoices.deletedAt),
			isNotNull(invoices.totalAmount),
			isNotNull(invoices.invoiceDate),
			sql`ABS(${invoices.invoiceDate} - ${invoiceDate}::date) <= ${DUPLICATE_DATE_WINDOW_DAYS}`,
			sql`ABS(${invoices.totalAmount} - ${totalAmount}) <= GREATEST(${invoices.totalAmount}, ${totalAmount}) * ${DUPLICATE_AMOUNT_TOLERANCE}`,
		))
		.orderBy(sql`ABS(${invoices.invoiceDate} - ${invoiceDate}::date) ASC`)
		.limit(1);

	if (matches.length === 0) return { alerts: [], linkedInvoiceId: null };
	const match = matches[0];

	const overlapRatio = await lineOverlapRatio(restaurantId, match.id, lineDescriptions);
	const isConfidentLink = overlapRatio >= CONFIDENT_LINE_OVERLAP_RATIO;
	const otherTypeLabel = otherType === 'factura' ? 'factura' : 'albarán';

	if (isConfidentLink) {
		const relatedVars = {
			supplier: supplierName,
			otherType: otherTypeLabel,
			matchedNumber: match.invoiceNumber ?? `#${match.id}`,
		};
		return {
			alerts: [{
				notificationType: 'related_document_found',
				message: renderTemplate('es', 'notif.msg.relatedDocumentFound', relatedVars),
				payload: {
					supplierId, supplierName, documentType, otherDocumentType: otherType,
					matchedInvoiceId: match.id,
					matchedInvoiceNumber: match.invoiceNumber,
					matchedInvoiceDate: match.invoiceDate,
					matchedTotalAmount: match.totalAmount,
					totalAmount,
					lineOverlapRatio: overlapRatio,
					messageKey: 'notif.msg.relatedDocumentFound',
					messageVars: relatedVars,
				},
			}],
			linkedInvoiceId: match.id,
		};
	}

	const duplicateVars = {
		supplier: supplierName,
		amount: totalAmount,
		otherType: otherTypeLabel,
		matchedNumber: match.invoiceNumber ?? `#${match.id}`,
	};
	return {
		alerts: [{
			notificationType: 'possible_duplicate_purchase',
			message: renderTemplate('es', 'notif.msg.possibleDuplicate', duplicateVars),
			payload: {
				supplierId, supplierName, documentType, otherDocumentType: otherType,
				matchedInvoiceId: match.id,
				matchedInvoiceNumber: match.invoiceNumber,
				matchedInvoiceDate: match.invoiceDate,
				matchedTotalAmount: match.totalAmount,
				totalAmount,
				messageKey: 'notif.msg.possibleDuplicate',
				messageVars: duplicateVars,
			},
		}],
		linkedInvoiceId: null,
	};
}

export async function saveAlerts(invoiceId: number | null, restaurantId: string, alerts: Alert[]): Promise<void> {
	if (alerts.length === 0) return;
	const enabled = await filterEnabledAlerts(restaurantId, alerts);
	if (enabled.length === 0) return;
	await db.transaction(async (tx) => {
		for (const alert of enabled) {
			await tx.insert(systemNotifications).values({
				invoiceId,
				restaurantId,
				notificationType: alert.notificationType,
				message: alert.message,
				payload: alert.payload ?? null,
				status: 'pending',
			});
		}
	});
}

async function safely(label: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
	} catch (err) {
		console.error(`[alerts] ${label} re-evaluation failed (non-fatal):`, err);
	}
}

async function resolveNotifications(tdb: ReturnType<typeof forTenant>, ids: number[]): Promise<void> {
	if (ids.length === 0) return;
	await db.update(systemNotifications)
		.set({ status: 'resolved' })
		.where(tdb.scope(systemNotifications.restaurantId, inArray(systemNotifications.id, ids)));
}

export async function reevaluatePriceShockAlerts(
	invoiceId: number,
	restaurantId: string,
	supplierName: string,
	lineItems: EnrichedLineItem[],
	productByKey?: Map<string, number>,
): Promise<void> {
	const tdb = forTenant(restaurantId);
	const pending = await db
		.select({ id: systemNotifications.id, payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			eq(systemNotifications.invoiceId, invoiceId),
			eq(systemNotifications.notificationType, 'price_shock'),
			eq(systemNotifications.status, 'pending'),
		)));
	if (pending.length === 0) return;

	const currentAlerts = await runPriceShock(invoiceId, supplierName, lineItems, restaurantId, productByKey);
	const stillShocking = new Set(currentAlerts.map((a) => (a.payload as { ingredient?: string }).ingredient));

	const toResolve = pending
		.filter((row) => !stillShocking.has((row.payload as { ingredient?: string } | null)?.ingredient))
		.map((row) => row.id);
	await resolveNotifications(tdb, toResolve);
}

async function reevaluateBudgetAlerts(restaurantId: string, categories: string[]): Promise<void> {
	if (categories.length === 0) return;
	const tdb = forTenant(restaurantId);

	const pending = await db
		.select({ id: systemNotifications.id, payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			eq(systemNotifications.notificationType, 'budget_overage'),
			eq(systemNotifications.status, 'pending'),
		)));
	const relevant = pending.filter((row) => {
		const category = (row.payload as { category?: string } | null)?.category;
		return category != null && categories.includes(category);
	});
	if (relevant.length === 0) return;

	const currentMonth = toMonthStr(new Date());
	const budgetRows = await db
		.select({ category: categoryBudgets.category, monthlyBudget: categoryBudgets.monthlyBudget })
		.from(categoryBudgets)
		.where(tdb.scope(categoryBudgets.restaurantId, and(
			inArray(categoryBudgets.category, categories),
			eq(categoryBudgets.month, currentMonth),
		)));
	const budgets = new Map(budgetRows.map((r): [string, number] => [r.category, moneyToNumber(r.monthlyBudget)]));

	const thresholdRows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, 'budget_warning_threshold')))
		.limit(1);
	const thresholdFrac = (thresholdRows[0] ? parseInt(thresholdRows[0].value, 10) : 80) / 100;

	const spendByCategory = await monthlyCategorySpend(tdb, categories);

	const toResolve: number[] = [];
	for (const row of relevant) {
		const payload = row.payload as { category: string; level?: 'exceeded' | 'warning' };
		const budget = budgets.get(payload.category);
		const spend = spendByCategory.get(payload.category) ?? 0;
		const pctFrac = budget && budget > 0 ? spend / budget : 0;
		const stillHolds = payload.level === 'exceeded' ? pctFrac >= 1.0 : pctFrac >= thresholdFrac;
		if (!stillHolds) toResolve.push(row.id);
	}
	await resolveNotifications(tdb, toResolve);
}

export async function reevaluateBudgetAlertsForInvoice(
	invoiceId: number,
	supplierId: number,
	restaurantId: string,
): Promise<void> {
	const tdb = forTenant(restaurantId);
	const categories = await invoiceLineCategories(tdb, invoiceId, supplierId);
	await reevaluateBudgetAlerts(restaurantId, categories);
}

async function reevaluateDuplicatePurchaseAlerts(input: DuplicatePurchaseInput): Promise<void> {
	const { invoiceId, restaurantId } = input;
	const tdb = forTenant(restaurantId);
	const pending = await db
		.select({ id: systemNotifications.id, notificationType: systemNotifications.notificationType })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			eq(systemNotifications.invoiceId, invoiceId),
			inArray(systemNotifications.notificationType, ['possible_duplicate_purchase', 'related_document_found']),
			eq(systemNotifications.status, 'pending'),
		)));
	if (pending.length === 0) return;

	const result = await runPossibleDuplicatePurchase(input);
	const currentType = result.alerts[0]?.notificationType ?? null;

	const toResolve = pending.filter((row) => row.notificationType !== currentType).map((row) => row.id);
	await resolveNotifications(tdb, toResolve);
}

async function reevaluateVerifactuAlerts(
	invoiceId: number,
	restaurantId: string,
	invoiceNumber: string | null,
	invoiceDate: string | null,
	totalAmount: string | null,
): Promise<void> {
	const tdb = forTenant(restaurantId);
	const pending = await db
		.select({ id: systemNotifications.id })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			eq(systemNotifications.invoiceId, invoiceId),
			eq(systemNotifications.notificationType, 'verifactu_qr_mismatch'),
			eq(systemNotifications.status, 'pending'),
		)));
	if (pending.length === 0) return;

	const [inv] = await db
		.select({ qrUrl: invoices.qrUrl })
		.from(invoices)
		.where(tdb.scope(invoices.restaurantId, eq(invoices.id, invoiceId)))
		.limit(1);
	if (!inv?.qrUrl) return;

	const mismatches = detectVerifactuMismatch(parseQrUrl(inv.qrUrl), {
		invoice_number: invoiceNumber,
		invoice_date: invoiceDate,
		total_amount: totalAmount == null ? null : moneyToNumber(totalAmount),
	});
	if (mismatches.length > 0) return;

	await resolveNotifications(tdb, pending.map((row) => row.id));
	await db.update(invoices)
		.set({ qrMismatch: false })
		.where(tdb.scope(invoices.restaurantId, eq(invoices.id, invoiceId)));
}

export interface InvoiceReevaluationInput {
	invoiceId: number;
	restaurantId: string;
	supplierId: number;
	supplierName: string;
	invoiceNumber: string | null;
	invoiceDate: string | null;
	totalAmount: string | null;
	documentType: 'factura' | 'albaran' | null;
	lineItems: EnrichedLineItem[];
	lineDescriptions: string[];
	productByKey?: Map<string, number>;
}

export async function reevaluateInvoiceAlerts(input: InvoiceReevaluationInput): Promise<void> {
	const {
		invoiceId, restaurantId, supplierId, supplierName,
		invoiceNumber, invoiceDate, totalAmount, documentType,
		lineItems, lineDescriptions, productByKey,
	} = input;

	await safely('price shock', () =>
		reevaluatePriceShockAlerts(invoiceId, restaurantId, supplierName, lineItems, productByKey));

	await safely('possible duplicate purchase', () =>
		reevaluateDuplicatePurchaseAlerts({
			invoiceId, supplierId, supplierName, restaurantId,
			documentType, invoiceDate, totalAmount, lineDescriptions,
		}));

	await safely('VERI*FACTU mismatch', () =>
		reevaluateVerifactuAlerts(invoiceId, restaurantId, invoiceNumber, invoiceDate, totalAmount));

	await safely('budget overage', () =>
		reevaluateBudgetAlertsForInvoice(invoiceId, supplierId, restaurantId));
}

const INVOICE_BOUND_ALERT_TYPES = ['price_shock', 'possible_duplicate_purchase', 'related_document_found', 'verifactu_qr_mismatch'];

export async function orphanInvoiceAlerts(invoiceId: number, restaurantId: string): Promise<void> {
	const tdb = forTenant(restaurantId);
	const pending = await db
		.select({ id: systemNotifications.id })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			eq(systemNotifications.invoiceId, invoiceId),
			eq(systemNotifications.status, 'pending'),
			inArray(systemNotifications.notificationType, INVOICE_BOUND_ALERT_TYPES),
		)));
	await resolveNotifications(tdb, pending.map((row) => row.id));
}

export async function resolveSupplierCategoryAlerts(restaurantId: string, supplierId: number): Promise<void> {
	const tdb = forTenant(restaurantId);
	const pending = await db
		.select({ id: systemNotifications.id })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			inArray(systemNotifications.notificationType, ['supplier_uncategorized', 'supplier_category_suggested']),
			eq(systemNotifications.status, 'pending'),
			sql`${systemNotifications.payload}->>'supplierId' = ${String(supplierId)}`,
		)));
	await resolveNotifications(tdb, pending.map((row) => row.id));
}

export const DIGEST_QUEUE = 'scheduled-weekly-digest';
export const REMINDERS_QUEUE = 'scheduled-overdue-reminders';
export const TRIAL_QUEUE = 'scheduled-trial-notices';
export const PURGE_QUEUE = 'scheduled-file-purge';
export const DEAD_LETTER_PURGE_QUEUE = 'scheduled-dead-letter-purge';
export const ANALYTICS_REFRESH_QUEUE = 'scheduled-analytics-refresh';
export const IDEMPOTENCY_SWEEP_QUEUE = 'scheduled-idempotency-sweep';

export const DIGEST_TENANT_QUEUE = 'tenant-weekly-digest';
export const REMINDERS_TENANT_QUEUE = 'tenant-overdue-reminder';
export const TRIAL_TENANT_QUEUE = 'tenant-trial-notice';

export const TENANT_FANOUT_QUEUES = [DIGEST_TENANT_QUEUE, REMINDERS_TENANT_QUEUE, TRIAL_TENANT_QUEUE];

const DIGEST_CRON = '0 6 * * 1';
const REMINDERS_CRON = '30 6 * * *';
const TRIAL_CRON = '0 7 * * *';
const PURGE_CRON = '0 3 * * *';
const DEAD_LETTER_PURGE_CRON = '20 3 * * *';
const ANALYTICS_REFRESH_CRON = '10 3 * * *';
const IDEMPOTENCY_SWEEP_CRON = '40 3 * * *';

export const DELETED_FILE_RETENTION_DAYS = 30;

const TRIAL_MILESTONES = [7, 1, 0] as const;

async function claimOnce(restaurantId: string, key: string, value: string): Promise<boolean> {
	const rows = await db.insert(settings)
		.values({ restaurantId, key, value })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value },
			setWhere: sql`${settings.value} <> ${value}`,
		})
		.returning({ value: settings.value });
	return rows.length > 0;
}

async function ownerEmail(restaurantId: string): Promise<string | null> {
	const tdb = forTenant(restaurantId);
	const [owner] = await db.select({ userId: userRestaurants.userId })
		.from(userRestaurants)
		.where(tdb.scope(userRestaurants.restaurantId, eq(userRestaurants.role, 'owner')))
		.limit(1);
	if (!owner) return null;

	const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, owner.userId)).limit(1);
	return row?.email ?? null;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export interface WeeklyDigestJobData extends TenantJobData {
	week: string;
}

export interface OverdueReminderJobData extends TenantJobData {
	day: string;
}

export interface TrialNoticeJobData extends TenantJobData {
	milestone: number;
	claim: string;
}

export async function runWeeklyDigestJob(boss: PgBoss): Promise<DispatchResult> {
	const week = isoWeek(new Date());

	return await dispatchTenantJobs<WeeklyDigestJobData>(boss, {
		queue: DIGEST_TENANT_QUEUE,
		label: 'weekly-digest',
		jobFor: (tenant) => TIERS[effectiveTier(tenant)].features.weeklyDigest
			? { data: { restaurantId: tenant.id, name: tenant.name, week }, singletonKey: `${tenant.id}:${week}` }
			: null,
	});
}

export async function sendWeeklyDigest(data: WeeklyDigestJobData): Promise<boolean> {
	if (!(await isAlertEnabled(data.restaurantId, 'weekly_digest'))) return false;

	const digest = await getOrGenerateWeeklyDigest(data.restaurantId, data.week);
	if (!digest) return false;

	if (!(await claimOnce(data.restaurantId, 'weekly_digest_email_week', data.week))) return false;

	const email = await ownerEmail(data.restaurantId);
	if (!email) return false;

	const html = digest
		.split(/\n{2,}/)
		.map(p => `<p>${p.trim()}</p>`)
		.join('\n');
	await sendEmail(weeklyDigestEmail(email, data.name, html));
	return true;
}

export async function runOverdueRemindersJob(boss: PgBoss): Promise<DispatchResult> {
	const day = today();

	return await dispatchTenantJobs<OverdueReminderJobData>(boss, {
		queue: REMINDERS_TENANT_QUEUE,
		label: 'overdue-reminders',
		jobFor: (tenant) => ({
			data: { restaurantId: tenant.id, name: tenant.name, day },
			singletonKey: `${tenant.id}:${day}`,
		}),
	});
}

export async function sendOverdueReminder(data: OverdueReminderJobData): Promise<boolean> {
	if (!(await isAlertEnabled(data.restaurantId, 'invoice_reminders'))) return false;

	const tdb = forTenant(data.restaurantId);
	const [row] = await db.select({
		count: sql<number>`COUNT(*)::int`,
		total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)::float8`,
	})
		.from(invoices)
		.where(tdb.scope(invoices.restaurantId, and(
			isNull(invoices.deletedAt),
			eq(invoices.reviewState, 'incidencia'),
		)));

	const count = Number(row?.count ?? 0);
	if (count === 0) return false;

	if (!(await claimOnce(data.restaurantId, 'incidencia_digest_sent_day', data.day))) return false;

	const email = await ownerEmail(data.restaurantId);
	if (!email) return false;

	const total = `${Number(row?.total ?? 0).toFixed(2)} €`;
	await sendEmail(incidenciaDigestEmail(email, data.name, count, total));
	return true;
}

export function trialDaysLeft(trialEndsAt: Date, now: Date = new Date()): number {
	return Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000);
}

export function trialMilestoneFor(daysLeft: number): number | null {
	if (daysLeft > 7) return null;
	if (daysLeft <= 0) return 0;
	if (daysLeft === 1) return 1;
	return 7;
}

export async function runTrialNoticesJob(boss: PgBoss): Promise<DispatchResult> {
	return await dispatchTenantJobs<TrialNoticeJobData>(boss, {
		queue: TRIAL_TENANT_QUEUE,
		label: 'trial-notices',
		jobFor: (tenant) => {
			if (tenant.status !== 'trialing' || !tenant.trialEndsAt) return null;
			const milestone = trialMilestoneFor(trialDaysLeft(tenant.trialEndsAt));
			if (milestone === null) return null;
			const claim = `${tenant.trialEndsAt.toISOString().slice(0, 10)}:${milestone}`;
			return {
				data: { restaurantId: tenant.id, name: tenant.name, milestone, claim },
				singletonKey: `${tenant.id}:${claim}`,
			};
		},
	});
}

export async function sendTrialNotice(data: TrialNoticeJobData): Promise<boolean> {
	if (!(await claimOnce(data.restaurantId, 'trial_notice_sent', data.claim))) return false;

	const email = await ownerEmail(data.restaurantId);
	if (!email) return false;

	await sendEmail(data.milestone === 0
		? trialExpiredEmail(email, data.name)
		: trialExpiryEmail(email, data.name, data.milestone));
	return true;
}

export async function runFilePurgeJob(): Promise<{ purged: number; failed: number }> {
	const cutoff = new Date(Date.now() - DELETED_FILE_RETENTION_DAYS * 86_400_000);
	// tenant-scope-ok: retention purge is a platform-wide background job — it
	// sweeps soft-deleted invoices across every tenant by design, and carries
	// restaurantId through so downstream file deletion stays per-tenant.
	const rows = await db.select({
		id: invoices.id,
		restaurantId: invoices.restaurantId,
		sourceFile: invoices.sourceFile,
	})
		.from(invoices)
		.where(and(
			isNotNull(invoices.deletedAt),
			isNotNull(invoices.sourceFile),
			lt(invoices.deletedAt, cutoff),
		))
		.limit(500);

	let purged = 0;
	let failed = 0;
	for (const row of rows) {
		try {
			await getStorage().delete(row.sourceFile!);
			const tdb = forTenant(row.restaurantId);
			await db.update(invoices)
				.set({ sourceFile: null })
				.where(tdb.scope(invoices.restaurantId, eq(invoices.id, row.id)));
			purged++;
		} catch (err) {
			failed++;
			console.error(`[scheduler] file purge failed for invoice ${row.id} (continuing):`, err);
			Sentry.captureException(err, { tags: { job: 'file-purge' } });
		}
	}
	if (purged || failed) console.info(`[scheduler] file purge: ${purged} purged, ${failed} failed`);
	return { purged, failed };
}

export async function runDeadLetterPurgeJob(): Promise<{ purged: number }> {
	const result = await purgeDeadLetters();
	if (result.purged) console.info(`[scheduler] dead-letter purge: ${result.purged} entries removed`);
	return result;
}

export async function runIdempotencySweepJob(): Promise<{ swept: number }> {
	const result = await sweepIdempotencyKeys();
	if (result.swept) console.info(`[scheduler] idempotency sweep: ${result.swept} claims expired`);
	return result;
}

export async function runAnalyticsRefreshJob(): Promise<{ refreshed: boolean }> {
	await db.execute(sql`SELECT refresh_analytics_rollups()`);
	return { refreshed: true };
}

interface ScheduledJob {
	queue: string;
	cron: string;
	run: (boss: PgBoss) => Promise<unknown>;
}

const JOBS: ScheduledJob[] = [
	{ queue: DIGEST_QUEUE, cron: DIGEST_CRON, run: runWeeklyDigestJob },
	{ queue: REMINDERS_QUEUE, cron: REMINDERS_CRON, run: runOverdueRemindersJob },
	{ queue: TRIAL_QUEUE, cron: TRIAL_CRON, run: runTrialNoticesJob },
	{ queue: PURGE_QUEUE, cron: PURGE_CRON, run: runFilePurgeJob },
	{ queue: MRR_SNAPSHOT_QUEUE, cron: MRR_SNAPSHOT_CRON, run: runMrrSnapshotJob },
	{ queue: DEAD_LETTER_PURGE_QUEUE, cron: DEAD_LETTER_PURGE_CRON, run: runDeadLetterPurgeJob },
	{ queue: ANALYTICS_REFRESH_QUEUE, cron: ANALYTICS_REFRESH_CRON, run: runAnalyticsRefreshJob },
	{ queue: IDEMPOTENCY_SWEEP_QUEUE, cron: IDEMPOTENCY_SWEEP_CRON, run: runIdempotencySweepJob },
	{ queue: ORPHAN_SUBSCRIPTIONS_QUEUE, cron: ORPHAN_SUBSCRIPTIONS_CRON, run: runOrphanSubscriptionsJob },
];

export async function registerScheduledJobs(boss: PgBoss): Promise<void> {
	await registerTenantFanout<WeeklyDigestJobData>(boss, {
		queue: DIGEST_TENANT_QUEUE, label: 'weekly-digest', run: sendWeeklyDigest,
	});
	await registerTenantFanout<OverdueReminderJobData>(boss, {
		queue: REMINDERS_TENANT_QUEUE, label: 'overdue-reminders', run: sendOverdueReminder,
	});
	await registerTenantFanout<TrialNoticeJobData>(boss, {
		queue: TRIAL_TENANT_QUEUE, label: 'trial-notices', run: sendTrialNotice,
	});
	console.info(`[scheduler] ${TENANT_FANOUT_QUEUES.length} per-tenant queues registered (${TENANT_FANOUT_QUEUES.join(', ')})`);

	for (const job of JOBS) {
		await boss.createQueue(job.queue);
		await boss.schedule(job.queue, job.cron, {}, { tz: 'UTC' });
		await boss.work(job.queue, { batchSize: 1 }, async () => {
			const started = Date.now();
			try {
				const result = await runAsSystem(() => job.run(boss));
				console.info(`[scheduler] ${job.queue} finished in ${Date.now() - started}ms`, result);
			} catch (err) {
				console.error(`[scheduler] ${job.queue} failed after ${Date.now() - started}ms — dead-lettered:`, err);
				Sentry.captureException(err, { tags: { job: job.queue } });
				await recordDeadLetter({ queue: job.queue, error: err, sourceId: job.queue });
				throw err;
			}
		});
	}
	console.info(`[scheduler] ${JOBS.length} scheduled jobs registered (${JOBS.map(j => j.queue).join(', ')})`);
}
