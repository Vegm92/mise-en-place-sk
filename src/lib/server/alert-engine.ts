/**
 * Active BI Engine — proactive alerts fired after each invoice save.
 * runPriceShock: detects >15% unit price deviation vs last recorded price.
 * runStockForecast: projects days-of-stock after purchase; alerts if < 3 days.
 * runBudgetCheck: fires budget_overage when category monthly spend crosses threshold.
 */
import { db } from './db';
import { invoiceLineItems, invoices, suppliers, stockLevels, categoryBudgets, settings, systemNotifications } from './schema';
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { EnrichedLineItem } from './unit-bridge';

const LOW_STOCK_DAYS = 3;

export interface Alert {
	notificationType: string;
	message: string;
	payload: Record<string, unknown>;
}

export async function runPriceShock(
	invoiceId: number,
	supplierName: string,
	lineItems: EnrichedLineItem[],
	restaurantId: string,
): Promise<Alert[]> {
	const alerts: Alert[] = [];

	const thresholdRows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(and(eq(settings.restaurantId, restaurantId), eq(settings.key, 'price_alert_threshold')))
		.limit(1);
	const PRICE_SHOCK_THRESHOLD = thresholdRows[0] ? parseFloat(thresholdRows[0].value) : 0.15;

	for (const item of lineItems) {
		const description = (item.description ?? '').trim();
		const newPrice = item.unitPrice;
		if (!description || newPrice == null) continue;

		const rows = await db
			.select({ unitPrice: invoiceLineItems.unitPrice })
			.from(invoiceLineItems)
			.innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
			.innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
			.where(
				and(
					eq(invoices.restaurantId, restaurantId),
					eq(invoiceLineItems.description, description),
					eq(suppliers.name, supplierName),
					ne(invoiceLineItems.invoiceId, invoiceId),
					isNotNull(invoiceLineItems.unitPrice)
				)
			)
			.orderBy(desc(invoices.invoiceDate), desc(invoices.id))
			.limit(1);

		if (!rows[0]) continue;

		const oldPrice = rows[0].unitPrice!;
		if (oldPrice === 0) continue;

		const deviation = (newPrice - oldPrice) / oldPrice;
		if (Math.abs(deviation) < PRICE_SHOCK_THRESHOLD) continue;

		const pct = Math.round(deviation * 1000) / 10;
		const direction = deviation > 0 ? 'subido' : 'bajado';

		alerts.push({
			notificationType: 'price_shock',
			message: `⚠️ Alerta de Coste: '${description}' ha ${direction} un ${Math.abs(pct)}% respecto al último precio registrado (${oldPrice.toFixed(2)} → ${newPrice.toFixed(2)}).`,
			payload: { ingredient: description, supplier: supplierName, oldPrice, newPrice, deviationPct: pct },
		});
	}

	return alerts;
}

export async function runStockForecast(lineItems: EnrichedLineItem[], restaurantId: string): Promise<Alert[]> {
	const alerts: Alert[] = [];

	for (const item of lineItems) {
		const description = (item.description ?? '').trim();
		if (!description) continue;

		const rows = await db
			.select({
				currentStock: stockLevels.currentStock,
				dailyBurnRate: stockLevels.dailyBurnRate,
				canonicalUnit: stockLevels.canonicalUnit,
			})
			.from(stockLevels)
			.where(and(
				eq(stockLevels.restaurantId, restaurantId),
				eq(stockLevels.ingredient, description),
			))
			.limit(1);

		const row = rows[0];
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

export async function runBudgetCheck(invoiceId: number, supplierId: number, restaurantId: string): Promise<Alert[]> {
	// 1. Supplier category
	const supplierRows = await db
		.select({ category: suppliers.category })
		.from(suppliers)
		.where(and(eq(suppliers.restaurantId, restaurantId), eq(suppliers.id, supplierId)))
		.limit(1);
	const category = supplierRows[0]?.category;
	if (!category) return [];

	// 2. Warning threshold (stored as 0-100 integer in settings, default 80)
	const thresholdRows = await db
		.select({ value: settings.value })
		.from(settings)
		.where(and(eq(settings.restaurantId, restaurantId), eq(settings.key, 'budget_warning_threshold')))
		.limit(1);
	const thresholdPct = thresholdRows[0] ? parseInt(thresholdRows[0].value, 10) : 80;
	const thresholdFrac = thresholdPct / 100;

	// 3. Monthly budget for category
	const budgetRows = await db
		.select({ monthlyBudget: categoryBudgets.monthlyBudget })
		.from(categoryBudgets)
		.where(and(eq(categoryBudgets.restaurantId, restaurantId), eq(categoryBudgets.category, category)))
		.limit(1);
	const monthlyBudget = budgetRows[0]?.monthlyBudget;
	if (!monthlyBudget || monthlyBudget <= 0) return [];

	// 4. This month's spend for category
	const spendRows = await db
		.select({ total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
		.from(invoices)
		.innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
		.where(and(
			eq(invoices.restaurantId, restaurantId),
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
			eq(systemNotifications.restaurantId, restaurantId),
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
