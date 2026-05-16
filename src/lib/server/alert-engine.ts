/**
 * Active BI Engine — proactive alerts fired after each invoice save.
 * runPriceShock: detects >15% unit price deviation vs last recorded price.
 * runStockForecast: projects days-of-stock after purchase; alerts if < 3 days.
 */
import { db } from './db';
import { invoiceLineItems, invoices, suppliers, stockLevels } from './schema';
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import type { EnrichedLineItem } from './unit-bridge';

const PRICE_SHOCK_THRESHOLD = 0.15;
const LOW_STOCK_DAYS = 3;

export interface Alert {
	notificationType: string;
	message: string;
	payload: Record<string, unknown>;
}

export function runPriceShock(
	invoiceId: number,
	supplierName: string,
	lineItems: EnrichedLineItem[]
): Alert[] {
	const alerts: Alert[] = [];

	for (const item of lineItems) {
		const description = (item.description ?? '').trim();
		const newPrice = item.unitPrice;
		if (!description || newPrice == null) continue;

		const rows = db
			.select({ unitPrice: invoiceLineItems.unitPrice })
			.from(invoiceLineItems)
			.innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
			.innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
			.where(
				and(
					eq(invoiceLineItems.description, description),
					eq(suppliers.name, supplierName),
					ne(invoiceLineItems.invoiceId, invoiceId),
					isNotNull(invoiceLineItems.unitPrice)
				)
			)
			.orderBy(desc(invoices.invoiceDate), desc(invoices.id))
			.limit(1)
			.all();

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

export function runStockForecast(lineItems: EnrichedLineItem[]): Alert[] {
	const alerts: Alert[] = [];

	for (const item of lineItems) {
		const description = (item.description ?? '').trim();
		if (!description) continue;

		const rows = db
			.select({
				currentStock: stockLevels.currentStock,
				dailyBurnRate: stockLevels.dailyBurnRate,
				canonicalUnit: stockLevels.canonicalUnit,
			})
			.from(stockLevels)
			.where(eq(stockLevels.ingredient, description))
			.limit(1)
			.all();

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
