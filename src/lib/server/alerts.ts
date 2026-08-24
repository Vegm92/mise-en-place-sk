import type { PgBoss } from 'pg-boss';
import { and, eq, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/sveltekit';
import { db, forTenant } from './db';
import { invoices, suppliers, stockLevels, categoryBudgets, settings, systemNotifications, restaurants, subscriptions, userRestaurants } from './schema';
import { users } from './schema';
import { toMonthStr } from '$lib/formatters';
import { UNCATEGORIZED_CATEGORY, VALID_CATEGORIES } from '$lib/constants';
import { normalizeProductKey } from './normalize';
import { parsePack, normalizedUnitPrice, type EnrichedLineItem } from './products';
import { moneyToNumber, moneyToNullableNumber } from './money';
import { sendEmail, weeklyDigestEmail, overdueInvoiceEmail, trialExpiryEmail, trialExpiredEmail } from './email';
import { getOrGenerateWeeklyDigest, isoWeek } from './weekly-digest';
import { TIERS, effectiveTier, type PlanTier } from './billing';
import { getStorage } from './storage';
import { MRR_SNAPSHOT_CRON, MRR_SNAPSHOT_QUEUE, runMrrSnapshotJob } from './revenue-metrics';
import { purgeDeadLetters, recordDeadLetter } from './dead-letter';
import { sweepIdempotencyKeys } from './idempotency';
import { filterEnabledAlerts, isAlertEnabled } from './alert-preferences';

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
	const sign = pct > 0 ? '+' : '';
	const unitSuffix = useNorm ? ` €/${newPack!.baseUnit}` : '';
	const basis = useNorm
		? { label: 'per_base_unit' as const, unit: newPack!.baseUnit }
		: { label: 'per_unit' as const, unit: null };

	return {
		notificationType: 'price_shock',
		message: `price_shock: ${description} ${sign}${pct}%`,
		payload: {
			ingredient: description, supplier: supplierName, oldPrice: oldCmp, newPrice: newCmp, deviationPct: pct, basis: basis.label, baseUnit: basis.unit,
			messageKey: deviation > 0 ? 'notif.msg.priceShockUp' : 'notif.msg.priceShockDown',
			messageVars: { ingredient: description, pct: Math.abs(pct), oldPrice: oldCmp.toFixed(2), newPrice: newCmp.toFixed(2), unitSuffix },
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
			sql`mep_norm_key(${stockLevels.ingredient}) IN (${sql.join(itemKeys.map(k => sql`${k}`), sql`, `)})`,
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

		alerts.push({
			notificationType: 'low_stock_forecast',
			message: `low_stock_forecast: ${description} ${daysRemaining.toFixed(1)}d`,
			payload: {
				ingredient: description,
				projectedDays: Math.round(daysRemaining * 10) / 10,
				currentStock: row.currentStock,
				addedQuantity: addedQty,
				dailyBurnRate: row.dailyBurnRate,
				unit: row.canonicalUnit,
				messageKey: 'notif.msg.lowStock',
				messageVars: { ingredient: description, days: daysRemaining.toFixed(1) },
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
		try {
			if ((JSON.parse(row.payload ?? '{}') as { supplierId?: number }).supplierId === supplierId) return [];
		} catch (e) { console.error(e); }
	}

	return [{
		notificationType: 'supplier_uncategorized',
		message: `supplier_uncategorized: ${supplier.name}`,
		payload: {
			supplierId,
			supplierName: supplier.name,
			messageKey: 'notif.msg.uncategorized',
			messageVars: { supplier: supplier.name },
		},
	}];
}

export async function runCategorySuggestion(
	supplierId: number,
	restaurantId: string,
	proposedCategory: string,
): Promise<Alert[]> {
	if (!proposedCategory || proposedCategory === UNCATEGORIZED_CATEGORY) return [];
	if (!VALID_CATEGORIES.includes(proposedCategory)) return [];

	const tdb = forTenant(restaurantId);

	const [supplier] = await db
		.select({ name: suppliers.name, category: suppliers.category })
		.from(suppliers)
		.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, supplierId)))
		.limit(1);
	if (!supplier) return [];
	if (supplier.category && supplier.category !== UNCATEGORIZED_CATEGORY) return [];

	const existing = await db
		.select({ payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(and(
			tdb.scope(systemNotifications.restaurantId),
			eq(systemNotifications.notificationType, 'supplier_category_suggested'),
		));
	for (const row of existing) {
		try {
			if ((JSON.parse(row.payload ?? '{}') as { supplierId?: number }).supplierId === supplierId) return [];
		} catch (e) { console.error(e); }
	}

	await db
		.update(systemNotifications)
		.set({ status: 'sent' })
		.where(tdb.scope(
			systemNotifications.restaurantId,
			and(
				eq(systemNotifications.notificationType, 'supplier_uncategorized'),
				eq(systemNotifications.status, 'pending'),
				sql`${systemNotifications.payload}::json->>'supplierId' = ${String(supplierId)}`,
			),
		));

	return [{
		notificationType: 'supplier_category_suggested',
		message: `supplier_category_suggested: ${supplier.name} -> ${proposedCategory}`,
		payload: {
			supplierId,
			supplierName: supplier.name,
			suggestedCategory: proposedCategory,
			messageKey: 'notif.msg.catSuggested',
			messageVars: { supplier: supplier.name, category: proposedCategory },
		},
	}];
}

export async function runBudgetCheck(invoiceId: number, supplierId: number, restaurantId: string): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);
	const supplierRows = await db
		.select({ category: suppliers.category })
		.from(suppliers)
		.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, supplierId)))
		.limit(1);
	const category = supplierRows[0]?.category ?? UNCATEGORIZED_CATEGORY;

	const thresholdRows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, 'budget_warning_threshold')))
		.limit(1);
	const thresholdPct = thresholdRows[0] ? parseInt(thresholdRows[0].value, 10) : 80;
	const thresholdFrac = thresholdPct / 100;

	const currentMonth = toMonthStr(new Date());
	const budgetRows = await db
		.select({ monthlyBudget: categoryBudgets.monthlyBudget })
		.from(categoryBudgets)
		.where(tdb.scope(categoryBudgets.restaurantId, and(eq(categoryBudgets.category, category), eq(categoryBudgets.month, currentMonth))))
		.limit(1);
	const monthlyBudget = moneyToNumber(budgetRows[0]?.monthlyBudget ?? null);
	if (!monthlyBudget || monthlyBudget <= 0) return [];

	const spendRows = await db
		.select({ total: sql<string>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
		.from(invoices)
		.innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNull(invoices.deletedAt),
			sql`COALESCE(${suppliers.category}, 'Other') = ${category}`,
			sql`TO_CHAR(${invoices.invoiceDate}, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')`
		));
	const totalSpend = moneyToNumber(spendRows[0]?.total ?? '0');
	const pctFrac = totalSpend / monthlyBudget;

	const level = pctFrac >= 1.0 ? 'exceeded' : pctFrac >= thresholdFrac ? 'warning' : null;
	if (!level) return [];

	const monthPrefix = new Date().toISOString().slice(0, 7);
	const existingRows = await db
		.select({ payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(and(
			tdb.scope(systemNotifications.restaurantId),
			eq(systemNotifications.notificationType, 'budget_overage'),
			sql`TO_CHAR(${systemNotifications.createdAt}, 'YYYY-MM') = ${monthPrefix}`
		));
	const alreadySent = existingRows.some(row => {
		try {
			const p = JSON.parse(row.payload ?? '{}');
			return p.category === category && p.level === level;
		} catch (e) { console.error(e); return false; }
	});
	if (alreadySent) return [];

	const pctDisplay = Math.round(pctFrac * 100);

	return [{
		notificationType: 'budget_overage',
		message: `budget_overage: ${category} ${pctDisplay}% (${level})`,
		payload: {
			category,
			spent: totalSpend,
			budget: monthlyBudget,
			pct: pctDisplay,
			threshold: thresholdPct,
			level,
			messageKey: level === 'exceeded' ? 'notif.msg.budgetExceeded' : 'notif.msg.budgetWarning',
			messageVars: { category, spent: totalSpend.toFixed(2), budget: monthlyBudget.toFixed(2), pct: pctDisplay, threshold: thresholdPct },
		},
	}];
}

const DUPLICATE_DATE_WINDOW_DAYS = 21;
const DUPLICATE_AMOUNT_TOLERANCE = 0.10;

export async function runPossibleDuplicatePurchase(
	invoiceId: number,
	supplierId: number,
	supplierName: string,
	restaurantId: string,
	documentType: 'factura' | 'albaran' | null,
	invoiceDate: string | null,
	totalAmount: string | null,
): Promise<Alert[]> {
	if (!documentType || !invoiceDate || totalAmount == null) return [];
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

	if (matches.length === 0) return [];
	const match = matches[0];

	return [{
		notificationType: 'possible_duplicate_purchase',
		message: `possible_duplicate_purchase: ${supplierName} ~${totalAmount} vs invoice #${match.id}`,
		payload: {
			supplierId, supplierName, documentType, otherDocumentType: otherType,
			matchedInvoiceId: match.id,
			matchedInvoiceNumber: match.invoiceNumber,
			matchedInvoiceDate: match.invoiceDate,
			matchedTotalAmount: match.totalAmount,
			totalAmount,
			messageKey: 'notif.msg.possibleDuplicate',
			messageVars: {
				supplier: supplierName,
				amount: totalAmount,
				otherType: otherType === 'factura' ? 'factura' : 'albarán',
				matchedNumber: match.invoiceNumber ?? `#${match.id}`,
			},
		},
	}];
}

export async function saveAlerts(invoiceId: number, restaurantId: string, alerts: Alert[]): Promise<void> {
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
				payload: alert.payload ? JSON.stringify(alert.payload) : null,
				status: 'pending',
			});
		}
	});
}

export const DIGEST_QUEUE = 'scheduled-weekly-digest';
export const REMINDERS_QUEUE = 'scheduled-overdue-reminders';
export const TRIAL_QUEUE = 'scheduled-trial-notices';
export const PURGE_QUEUE = 'scheduled-file-purge';
export const DEAD_LETTER_PURGE_QUEUE = 'scheduled-dead-letter-purge';
export const ANALYTICS_REFRESH_QUEUE = 'scheduled-analytics-refresh';
export const IDEMPOTENCY_SWEEP_QUEUE = 'scheduled-idempotency-sweep';

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

async function allTenants(): Promise<Array<{
	id: string;
	name: string;
	planTier: PlanTier;
	status: string;
	trialEndsAt: Date | null;
}>> {
	const rows = await db.select({
		id: restaurants.id,
		name: restaurants.name,
		planTier: subscriptions.planTier,
		status: subscriptions.status,
		trialEndsAt: subscriptions.trialEndsAt,
	})
		.from(restaurants)
		.leftJoin(subscriptions, eq(restaurants.id, subscriptions.restaurantId));

	return rows.map(r => ({
		id: r.id,
		name: r.name,
		planTier: (r.planTier ?? 'trial') as PlanTier,
		status: r.status ?? 'trialing',
		trialEndsAt: r.trialEndsAt ?? null,
	}));
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

async function perTenant<T extends { id?: string }>(
	label: string,
	tenants: T[],
	fn: (tenant: T) => Promise<boolean>,
): Promise<{ considered: number; sent: number }> {
	let sent = 0;
	for (const tenant of tenants) {
		try {
			if (await fn(tenant)) sent++;
		} catch (err) {
			console.error(`[scheduler] ${label} failed for a tenant (continuing):`, err);
			Sentry.captureException(err, { tags: { job: label } });
			await recordDeadLetter({
				queue: label,
				error: err,
				restaurantId: tenant.id ?? null,
				sourceId: tenant.id ?? null,
			});
		}
	}
	return { considered: tenants.length, sent };
}

export async function runWeeklyDigestJob(): Promise<{ considered: number; sent: number }> {
	const week = isoWeek(new Date());
	const tenants = (await allTenants()).filter(t => TIERS[effectiveTier(t)].features.weeklyDigest);

	return await perTenant('weekly-digest', tenants, async (tenant) => {
		if (!(await isAlertEnabled(tenant.id, 'weekly_digest'))) return false;

		const digest = await getOrGenerateWeeklyDigest(tenant.id, week);
		if (!digest?.text) return false;

		if (!(await claimOnce(tenant.id, 'weekly_digest_email_week', week))) return false;

		const email = await ownerEmail(tenant.id);
		if (!email) return false;

		const html = digest.text
			.split(/\n{2,}/)
			.map(p => `<p>${p.trim()}</p>`)
			.join('\n');
		await sendEmail(weeklyDigestEmail(email, tenant.name, html));
		return true;
	});
}

export async function runOverdueRemindersJob(): Promise<{ considered: number; sent: number }> {
	const tenants = await allTenants();
	const day = today();

	return await perTenant('overdue-reminders', tenants, async (tenant) => {
		if (!(await isAlertEnabled(tenant.id, 'invoice_reminders'))) return false;

		const tdb = forTenant(tenant.id);
		const [row] = await db.select({
			count: sql<number>`COUNT(*)::int`,
			total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)::float8`,
		})
			.from(invoices)
			.where(tdb.scope(invoices.restaurantId, and(
				isNull(invoices.deletedAt),
				ne(invoices.status, 'paid'),
				isNotNull(invoices.dueDate),
				sql`${invoices.dueDate} < ${day}`,
			)));

		const count = row?.count ?? 0;
		if (count === 0) return false;

		if (!(await claimOnce(tenant.id, 'overdue_reminder_sent_day', day))) return false;

		const email = await ownerEmail(tenant.id);
		if (!email) return false;

		const total = `${(row?.total ?? 0).toFixed(2)} €`;
		await sendEmail(overdueInvoiceEmail(email, tenant.name, count, total));
		return true;
	});
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

export async function runTrialNoticesJob(): Promise<{ considered: number; sent: number }> {
	const tenants = (await allTenants()).filter(t => t.status === 'trialing' && t.trialEndsAt);

	return await perTenant('trial-notices', tenants, async (tenant) => {
		const daysLeft = trialDaysLeft(tenant.trialEndsAt!);
		const milestone = trialMilestoneFor(daysLeft);
		if (milestone === null) return false;

		const claim = `${tenant.trialEndsAt!.toISOString().slice(0, 10)}:${milestone}`;
		if (!(await claimOnce(tenant.id, 'trial_notice_sent', claim))) return false;

		const email = await ownerEmail(tenant.id);
		if (!email) return false;

		await sendEmail(milestone === 0
			? trialExpiredEmail(email, tenant.name)
			: trialExpiryEmail(email, tenant.name, milestone));
		return true;
	});
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
	run: () => Promise<unknown>;
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
];

export async function registerScheduledJobs(boss: PgBoss): Promise<void> {
	for (const job of JOBS) {
		await boss.createQueue(job.queue);
		await boss.schedule(job.queue, job.cron, {}, { tz: 'UTC' });
		await boss.work(job.queue, { batchSize: 1 }, async () => {
			const started = Date.now();
			try {
				const result = await job.run();
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
