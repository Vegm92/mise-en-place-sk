import { db, forTenant } from './db';
import { invoiceLineItems, invoices, suppliers, stockLevels, categoryBudgets, settings, systemNotifications } from './schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { toMonthStr } from '$lib/formatters';
import { UNCATEGORIZED_CATEGORY, VALID_CATEGORIES } from '$lib/constants';
import { normalizeProductKey } from './normalize';
import { parsePack, normalizedUnitPrice } from './pack-parser';
import type { EnrichedLineItem } from './unit-bridge';

const LOW_STOCK_DAYS = 3;

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

function collapseHistory(points: PricePoint[]): PricePoint {
	if (points.length === 1) return points[0];
	const unitPrice = median(points.map(p => p.unitPrice));
	const baseUnit = points[0].baseUnit;
	const sameBaseUnit = baseUnit != null && points.every(p => p.baseUnit === baseUnit && p.normalizedUnitPrice != null);
	const normalizedUnitPrice = sameBaseUnit ? median(points.map(p => p.normalizedUnitPrice!)) : null;
	return { unitPrice, normalizedUnitPrice, baseUnit: sameBaseUnit ? baseUnit : null };
}

const PRICE_HISTORY_WINDOW = 3;

export async function runPriceShock(
	invoiceId: number,
	supplierName: string,
	lineItems: EnrichedLineItem[],
	restaurantId: string,
	productByKey?: Map<string, number>,
): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);
	const alerts: Alert[] = [];

	const thresholdRows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, 'price_alert_threshold')))
		.limit(1);
	const PRICE_SHOCK_THRESHOLD = thresholdRows[0] ? parseFloat(thresholdRows[0].value) : 0.15;

	const itemKeys = [...new Set(lineItems.map(i => normalizeProductKey(i.description ?? '')).filter(Boolean))];
	if (itemKeys.length === 0) return [];

	const priceRows = await db.execute<{ itemKey: string; unitPrice: number; normalizedUnitPrice: number | null; baseUnit: string | null }>(sql`
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

	const keyPriceHistory = new Map<string, PricePoint[]>();
	for (const row of priceRows) {
		const point = { unitPrice: row.unitPrice, normalizedUnitPrice: row.normalizedUnitPrice, baseUnit: row.baseUnit };
		const arr = keyPriceHistory.get(row.itemKey);
		if (arr) arr.push(point); else keyPriceHistory.set(row.itemKey, [point]);
	}
	const keyPriceMap = new Map<string, PricePoint>();
	for (const [key, points] of keyPriceHistory) keyPriceMap.set(key, collapseHistory(points));

	const productPriceMap = new Map<number, PricePoint>();
	const productIds = productByKey ? [...new Set(productByKey.values())] : [];
	if (productIds.length > 0) {
		const productRows = await db.execute<{ productId: number; unitPrice: number; normalizedUnitPrice: number | null; baseUnit: string | null }>(sql`
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
		const productHistory = new Map<number, PricePoint[]>();
		for (const row of productRows) {
			const point = { unitPrice: row.unitPrice, normalizedUnitPrice: row.normalizedUnitPrice, baseUnit: row.baseUnit };
			const arr = productHistory.get(row.productId);
			if (arr) arr.push(point); else productHistory.set(row.productId, [point]);
		}
		for (const [productId, points] of productHistory) productPriceMap.set(productId, collapseHistory(points));
	}

	for (const item of lineItems) {
		const description = (item.description ?? '').trim();
		const newPrice = item.unitPrice;
		if (!description || newPrice == null) continue;

		const key = normalizeProductKey(description);
		const pid = productByKey?.get(key);
		const prev = (pid != null ? productPriceMap.get(pid) : undefined) ?? keyPriceMap.get(key);
		if (!prev) continue;

		const newPack = parsePack(description, item.unit);
		const newNorm = normalizedUnitPrice(newPrice, newPack);
		const useNorm = newNorm != null && prev.normalizedUnitPrice != null && prev.normalizedUnitPrice > 0
			&& newPack != null && prev.baseUnit != null && newPack.baseUnit === prev.baseUnit;

		const oldCmp = useNorm ? prev.normalizedUnitPrice! : prev.unitPrice;
		const newCmp = useNorm ? newNorm! : newPrice;
		if (oldCmp === 0) continue;

		const deviation = (newCmp - oldCmp) / oldCmp;
		if (Math.abs(deviation) < PRICE_SHOCK_THRESHOLD) continue;

		const pct = Math.round(deviation * 1000) / 10;
		const unitSuffix = useNorm ? ` €/${newPack!.baseUnit}` : '';

		alerts.push({
			notificationType: 'price_shock',
			message: `price_shock: ${description} ${pct > 0 ? '+' : ''}${pct}%`,
			payload: {
				ingredient: description, supplier: supplierName, oldPrice: oldCmp, newPrice: newCmp, deviationPct: pct, basis: useNorm ? 'per_base_unit' : 'per_unit', baseUnit: useNorm ? newPack!.baseUnit : null,
				messageKey: deviation > 0 ? 'notif.msg.priceShockUp' : 'notif.msg.priceShockDown',
				messageVars: { ingredient: description, pct: Math.abs(pct), oldPrice: oldCmp.toFixed(2), newPrice: newCmp.toFixed(2), unitSuffix },
			},
		});
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
		} catch { }
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
		} catch { }
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
	const monthlyBudget = budgetRows[0]?.monthlyBudget;
	if (!monthlyBudget || monthlyBudget <= 0) return [];

	const spendRows = await db
		.select({ total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
		.from(invoices)
		.innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNull(invoices.deletedAt),
			sql`COALESCE(${suppliers.category}, 'Other') = ${category}`,
			sql`TO_CHAR((${invoices.invoiceDate})::date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')`
		));
	const totalSpend = spendRows[0]?.total ?? 0;
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
		} catch { return false; }
	});
	if (alreadySent) return [];

	const pctDisplay = Math.round(pctFrac * 100);

	return [{
		notificationType: 'budget_overage',
		message: `budget_overage: ${category} ${pctDisplay}% (${level})`,
		payload: {
			category,
			spent: Math.round(totalSpend * 100) / 100,
			budget: monthlyBudget,
			pct: pctDisplay,
			threshold: thresholdPct,
			level,
			messageKey: level === 'exceeded' ? 'notif.msg.budgetExceeded' : 'notif.msg.budgetWarning',
			messageVars: { category, spent: totalSpend.toFixed(2), budget: monthlyBudget.toFixed(2), pct: pctDisplay, threshold: thresholdPct },
		},
	}];
}
