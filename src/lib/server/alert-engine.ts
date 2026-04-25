/**
 * Active BI Engine — proactive alerts fired after each invoice save.
 * runPriceShock: detects >15% unit price deviation vs last recorded price.
 * runStockForecast: projects days-of-stock after purchase; alerts if < 3 days.
 */
import { dbClient } from './db';
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

	const stmt = dbClient.prepare<[string, string, number]>(`
		SELECT li.unit_price
		FROM invoice_line_items li
		JOIN invoices i ON li.invoice_id = i.id
		JOIN suppliers s ON i.supplier_id = s.id
		WHERE li.description = ?
		  AND s.name = ?
		  AND li.invoice_id != ?
		  AND li.unit_price IS NOT NULL
		ORDER BY i.invoice_date DESC, i.id DESC
		LIMIT 1
	`);

	for (const item of lineItems) {
		const description = (item.description ?? '').trim();
		const newPrice = item.unitPrice;
		if (!description || newPrice == null) continue;

		const row = stmt.get(description, supplierName, invoiceId) as { unit_price: number } | undefined;
		if (!row) continue;

		const oldPrice = row.unit_price;
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

	const stmt = dbClient.prepare<[string]>(`
		SELECT current_stock, daily_burn_rate, canonical_unit
		FROM stock_levels
		WHERE ingredient = ?
	`);

	for (const item of lineItems) {
		const description = (item.description ?? '').trim();
		if (!description) continue;

		const row = stmt.get(description) as {
			current_stock: number;
			daily_burn_rate: number;
			canonical_unit: string | null;
		} | undefined;

		if (row?.current_stock == null || row.daily_burn_rate == null || row.daily_burn_rate === 0) continue;

		const addedQty = item.convertedQuantity ?? item.quantity ?? 0;
		const projectedStock = row.current_stock + addedQty;
		const daysRemaining = projectedStock / row.daily_burn_rate;

		if (daysRemaining >= LOW_STOCK_DAYS) continue;

		alerts.push({
			notificationType: 'low_stock_forecast',
			message: `📦 Reabastecimiento: '${description}' tendrá stock para ${daysRemaining.toFixed(1)} días tras esta factura. Considera hacer un nuevo pedido pronto.`,
			payload: {
				ingredient: description,
				projectedDays: Math.round(daysRemaining * 10) / 10,
				currentStock: row.current_stock,
				addedQuantity: addedQty,
				dailyBurnRate: row.daily_burn_rate,
				unit: row.canonical_unit,
			},
		});
	}

	return alerts;
}
