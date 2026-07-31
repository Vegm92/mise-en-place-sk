import { db, forTenant } from './db';
import { unitConversions } from './schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import { conversionKey, resolveUnitFromMap } from './unit-bridge-pure';

export { resolveUnitFromMap } from './unit-bridge-pure';

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

export async function loadConversionMap(
	supplierName: string,
	restaurantId: string,
	supplierId?: number | null,
): Promise<Map<string, { canonicalUnit: string; conversionFactor: number }>> {
	const tdb = forTenant(restaurantId);
	const normalizedSupplier = supplierName.trim().toLowerCase();

	const supplierFilter = supplierId != null
		? or(
			eq(unitConversions.supplierId, supplierId),
			and(isNull(unitConversions.supplierId), eq(unitConversions.supplierName, normalizedSupplier))
		  )
		: eq(unitConversions.supplierName, normalizedSupplier);

	const rows = await db
		.select()
		.from(unitConversions)
		.where(and(tdb.scope(unitConversions.restaurantId), supplierFilter));

	const map = new Map<string, { canonicalUnit: string; conversionFactor: number }>();
	for (const row of rows) {
		map.set(conversionKey(row.ingredient, row.purchaseUnit), {
			canonicalUnit: row.canonicalUnit,
			conversionFactor: row.conversionFactor,
		});
	}
	return map;
}

export async function resolveUnit(
	supplierName: string,
	description: string,
	unit: string,
	restaurantId: string,
	supplierId?: number | null,
): Promise<{ canonicalUnit: string; conversionFactor: number } | null> {
	const map = await loadConversionMap(supplierName, restaurantId, supplierId);
	return resolveUnitFromMap(map, description, unit);
}

export async function annotateLineItems(
	supplierName: string,
	items: LineItem[],
	restaurantId: string,
	supplierId?: number | null,
): Promise<{ enriched: EnrichedLineItem[]; conversionNotes: string[] }> {
	const conversionNotes: string[] = [];

	const conversionMap = await loadConversionMap(supplierName, restaurantId, supplierId);

	const enriched: EnrichedLineItem[] = items.map((item) => {
		const unit = (item.unit ?? '').trim();
		const description = (item.description ?? '').trim();

		if (!unit || !description) {
			return { ...item, canonicalUnit: null, requiresUnitConversion: false };
		}

		const rule = resolveUnitFromMap(conversionMap, description, unit);

		if (rule && rule.conversionFactor > 0) {
			const factor = rule.conversionFactor;
			return {
				...item,
				canonicalUnit: rule.canonicalUnit,
				requiresUnitConversion: false,
				convertedQuantity: item.quantity == null ? null : Math.round(item.quantity * factor * 10000) / 10000,
				convertedUnitPrice: item.unitPrice == null ? null : Math.round((item.unitPrice / factor) * 10000) / 10000,
			};
		}

		conversionNotes.push(
			`Unit '${unit}' is unknown for '${description}' (supplier: ${supplierName}). Awaiting conversion rule.`
		);
		return { ...item, canonicalUnit: null, requiresUnitConversion: true };
	});

	return { enriched, conversionNotes };
}
