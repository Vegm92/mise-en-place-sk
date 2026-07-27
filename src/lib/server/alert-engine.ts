/**
 * Active BI Engine — proactive alerts fired after each invoice save.
 * runPriceShock: detects >15% unit price deviation vs last recorded price.
 * runStockForecast: projects days-of-stock after purchase; alerts if < 3 days.
 * runBudgetCheck: fires budget_overage when category monthly spend crosses threshold.
 */
import { db, forTenant } from './db';
import { invoiceLineItems, invoices, suppliers, stockLevels, categoryBudgets, settings, systemNotifications } from './schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { toMonthStr } from '$lib/formatters';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';
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

/** Middle value of a numeric list (lower of the two middles on an even count). */
function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * Collapses up to the last `HISTORY_SIZE` price points for one key into a
 * single comparison point: the median unit price, plus a median €/base price
 * when every point in the window shares the same base unit (issue #308) —
 * a single noisy purchase (a different pack size, a one-off promo, a
 * seasonal blip) no longer reads as a shock against the very next delivery;
 * a real, sustained price change still shows up on the first purchase after
 * it happens, same as before.
 */
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

	// Match by the shared normalized key (issue #296): "TOMATE PERA" and
	// "Tomate Pera" are the same product. mep_norm_key is the SQL twin of
	// normalizeProductKey — both sides of the comparison use the same fold.
	const itemKeys = [...new Set(lineItems.map(i => normalizeProductKey(i.description ?? '')).filter(Boolean))];
	if (itemKeys.length === 0) return [];

	// Batch: the last PRICE_HISTORY_WINDOW price points per item key (not just
	// the single latest one — issue #308), so the comparison point can be a
	// median instead of one potentially-noisy purchase. Also pull the stored
	// €/base (issue #299) so pack sizes can be compared apples-to-apples.
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

	// When lines are resolved to catalog products (issue #298), also fetch the
	// latest price per product_id — differently-sized descriptions of one product
	// ("saco 25kg" vs "saco 10kg") share a product but not a description key, and
	// only this grouping (compared as €/base) makes them meet without a false shock.
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
		// Prefer the product-grouped history; fall back to same-description history.
		const prev = (pid != null ? productPriceMap.get(pid) : undefined) ?? keyPriceMap.get(key);
		if (!prev) continue;

		// Prefer €/base when both sides carry it for the same base unit — this is
		// what stops "caja 5kg" vs "caja 10kg" of one product from reading as a
		// ~92% shock. Otherwise compare the raw unit price as before.
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
		const direction = deviation > 0 ? 'subido' : 'bajado';
		const unitSuffix = useNorm ? ` €/${newPack!.baseUnit}` : '';

		alerts.push({
			notificationType: 'price_shock',
			message: `⚠️ Alerta de Coste: '${description}' ha ${direction} un ${Math.abs(pct)}% respecto a tu precio habitual reciente (${oldCmp.toFixed(2)} → ${newCmp.toFixed(2)}${unitSuffix}).`,
			payload: { ingredient: description, supplier: supplierName, oldPrice: oldCmp, newPrice: newCmp, deviationPct: pct, basis: useNorm ? 'per_base_unit' : 'per_unit', baseUnit: useNorm ? newPack!.baseUnit : null },
		});
	}

	return alerts;
}

export async function runStockForecast(lineItems: EnrichedLineItem[], restaurantId: string): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);
	const alerts: Alert[] = [];

	const itemKeys = [...new Set(lineItems.map(i => normalizeProductKey(i.description ?? '')).filter(Boolean))];
	if (itemKeys.length === 0) return [];

	// Batch: one IN query for all stock levels, matched on the normalized key
	// so "Harina 00" on the invoice updates a stock row saved as "harina 00".
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
			message: `📦 Reabastecimiento: '${description}' tendrá stock para ${daysRemaining.toFixed(1)} días tras esta factura. Considera hacer un nuevo pedido pronto.`,
			payload: {
				ingredient: description,
				projectedDays: Math.round(daysRemaining * 10) / 10,
				currentStock: row.currentStock,
				addedQuantity: addedQty,
				dailyBurnRate: row.dailyBurnRate,
				unit: row.canonicalUnit,
			},
		});
	}

	return alerts;
}

/**
 * Nudge the owner to categorise a supplier the first time one of its invoices
 * is saved (issue #301). An uncategorised supplier's spend is lumped into the
 * "Sin categoría" bucket: visible, but it can't be budgeted against or read as
 * a real category — and nothing used to ask. One notification per supplier,
 * ever: it is deduped on the supplier id, and the supplier only qualifies while
 * it is still uncategorised.
 */
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

	// Only on the supplier's first invoice — later ones would nag.
	const [countRow] = await db
		.select({ cnt: sql<number>`COUNT(*)::int` })
		.from(invoices)
		.where(tdb.scope(invoices.restaurantId, and(
			eq(invoices.supplierId, supplierId),
			isNull(invoices.deletedAt),
		)));
	if ((countRow?.cnt ?? 0) > 1) return [];

	// Belt and braces: if one was already raised for this supplier (a deleted
	// first invoice, a re-save), don't raise a second.
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
		} catch { /* malformed payload — treat as no match */ }
	}

	return [{
		notificationType: 'supplier_uncategorized',
		message: `Clasifica a '${supplier.name}' para incluir su gasto en presupuestos y análisis por categoría.`,
		payload: { supplierId, supplierName: supplier.name },
	}];
}

export async function runBudgetCheck(invoiceId: number, supplierId: number, restaurantId: string): Promise<Alert[]> {
	const tdb = forTenant(restaurantId);
	// 1. Supplier category
	const supplierRows = await db
		.select({ category: suppliers.category })
		.from(suppliers)
		.where(tdb.scope(suppliers.restaurantId, eq(suppliers.id, supplierId)))
		.limit(1);
	// Legacy suppliers (created before uncategorised became an explicit 'Other'
	// bucket) still carry NULL. Treating that as "no budget applies" made all
	// their spend invisible to budget alerts, silently — issue #301. It now
	// falls into the same 'Other' bucket the spend query below already uses.
	const category = supplierRows[0]?.category ?? UNCATEGORIZED_CATEGORY;

	// 2. Warning threshold (stored as 0-100 integer in settings, default 80)
	const thresholdRows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, 'budget_warning_threshold')))
		.limit(1);
	const thresholdPct = thresholdRows[0] ? parseInt(thresholdRows[0].value, 10) : 80;
	const thresholdFrac = thresholdPct / 100;

	// 3. Monthly budget for category (current month only)
	const currentMonth = toMonthStr(new Date());
	const budgetRows = await db
		.select({ monthlyBudget: categoryBudgets.monthlyBudget })
		.from(categoryBudgets)
		.where(tdb.scope(categoryBudgets.restaurantId, and(eq(categoryBudgets.category, category), eq(categoryBudgets.month, currentMonth))))
		.limit(1);
	const monthlyBudget = budgetRows[0]?.monthlyBudget;
	if (!monthlyBudget || monthlyBudget <= 0) return [];

	// 4. This month's spend for category
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

	// 5. Determine alert level
	const level = pctFrac >= 1.0 ? 'exceeded' : pctFrac >= thresholdFrac ? 'warning' : null;
	if (!level) return [];

	// 6. Dedup: one alert per category+level per calendar month
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
	const message = level === 'exceeded'
		? `🔴 Presupuesto superado: '${category}' ha gastado ${totalSpend.toFixed(2)} € de ${monthlyBudget.toFixed(2)} € (${pctDisplay}%).`
		: `🟡 Aviso de presupuesto: '${category}' lleva ${totalSpend.toFixed(2)} € de ${monthlyBudget.toFixed(2)} € (${pctDisplay}%). Límite: ${thresholdPct}%.`;

	return [{
		notificationType: 'budget_overage',
		message,
		payload: {
			category,
			spent: Math.round(totalSpend * 100) / 100,
			budget: monthlyBudget,
			pct: pctDisplay,
			threshold: thresholdPct,
			level,
		},
	}];
}
