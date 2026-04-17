/**
 * Unit Bridge — resolves purchase units (invoices) to canonical units.
 * Queries unit_conversions and annotates line items in place.
 */
import { db } from './db';
import { unitConversions } from './schema';
import { and, eq } from 'drizzle-orm';

export interface LineItem {
	description: string;
	quantity: number | null;
	unit: string | null;
	unitPrice: number | null;
	totalPrice: number | null;
	[key: string]: unknown;
}

export interface EnrichedLineItem extends LineItem {
	canonicalUnit: string | null;
	requiresUnitConversion: boolean;
	convertedQuantity?: number | null;
	convertedUnitPrice?: number | null;
}

export function resolveUnit(
	supplierName: string,
	description: string,
	unit: string
): { canonicalUnit: string; conversionFactor: number } | null {
	const rows = db
		.select()
		.from(unitConversions)
		.where(
			and(
				eq(unitConversions.supplierName, supplierName),
				eq(unitConversions.ingredient, description),
				eq(unitConversions.purchaseUnit, unit)
			)
		)
		.limit(1)
		.all();
	return rows[0] ?? null;
}

export function annotateLineItems(
	supplierName: string,
	items: LineItem[]
): { enriched: EnrichedLineItem[]; conversionNotes: string[] } {
	const conversionNotes: string[] = [];

	const enriched: EnrichedLineItem[] = items.map((item) => {
		const unit = (item.unit ?? '').trim();
		const description = (item.description ?? '').trim();

		if (!unit || !description) {
			return { ...item, canonicalUnit: null, requiresUnitConversion: false };
		}

		const rule = resolveUnit(supplierName, description, unit);

		if (rule) {
			const factor = rule.conversionFactor;
			return {
				...item,
				canonicalUnit: rule.canonicalUnit,
				requiresUnitConversion: false,
				convertedQuantity: item.quantity != null ? Math.round(item.quantity * factor * 10000) / 10000 : null,
				convertedUnitPrice: item.unitPrice != null ? Math.round((item.unitPrice / factor) * 10000) / 10000 : null,
			};
		}

		conversionNotes.push(
			`Unit '${unit}' is unknown for '${description}' (supplier: ${supplierName}). Awaiting conversion rule.`
		);
		return { ...item, canonicalUnit: null, requiresUnitConversion: true };
	});

	return { enriched, conversionNotes };
}
