/**
 * Unit Bridge — resolves purchase units (invoices) to canonical units.
 * Queries unit_conversions and annotates line items in place.
 */
import { db, forTenant } from './db';
import { unitConversions } from './schema';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { CANONICAL_UNITS, resolveUnitFromMap } from './unit-bridge-pure';

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

export async function resolveUnit(
	supplierName: string,
	description: string,
	unit: string,
	restaurantId: string,
	supplierId?: number | null,
): Promise<{ canonicalUnit: string; conversionFactor: number } | null> {
	const tdb = forTenant(restaurantId);
	const normalizedSupplier = supplierName.trim().toLowerCase();
	// When supplierId is known, match rules pinned by FK or pre-supplier name-only rules.
	const supplierFilter = supplierId != null
		? or(
			eq(unitConversions.supplierId, supplierId),
			and(isNull(unitConversions.supplierId), eq(unitConversions.supplierName, normalizedSupplier))
		  )
		: eq(unitConversions.supplierName, normalizedSupplier);
	const rows = await db
		.select()
		.from(unitConversions)
		.where(
			and(
				tdb.scope(unitConversions.restaurantId),
				supplierFilter,
				eq(unitConversions.ingredient, description),
				eq(unitConversions.purchaseUnit, unit)
			)
		)
		.limit(1);
	if (rows[0]) return rows[0];

	// Fall back to pass-through for known canonical units.
	if (CANONICAL_UNITS.has(unit.trim())) {
		return { canonicalUnit: unit.trim(), conversionFactor: 1 };
	}
	return null;
}

export async function loadConversionMap(
	supplierName: string,
	descriptions: string[],
	restaurantId: string,
	supplierId?: number | null,
): Promise<Map<string, { canonicalUnit: string; conversionFactor: number }>> {
	const tdb = forTenant(restaurantId);
	const normalizedSupplier = supplierName.trim().toLowerCase();
	if (descriptions.length === 0) return new Map();

	const supplierFilter = supplierId != null
		? or(
			eq(unitConversions.supplierId, supplierId),
			and(isNull(unitConversions.supplierId), eq(unitConversions.supplierName, normalizedSupplier))
		  )
		: eq(unitConversions.supplierName, normalizedSupplier);

	const rows = await db
		.select()
		.from(unitConversions)
		.where(
			and(
				tdb.scope(unitConversions.restaurantId),
				supplierFilter,
				inArray(unitConversions.ingredient, descriptions),
			)
		);

	const map = new Map<string, { canonicalUnit: string; conversionFactor: number }>();
	for (const row of rows) {
		map.set(`${row.ingredient}::${row.purchaseUnit}`, { canonicalUnit: row.canonicalUnit, conversionFactor: row.conversionFactor });
	}
	return map;
}

export async function annotateLineItems(
	supplierName: string,
	items: LineItem[],
	restaurantId: string,
	supplierId?: number | null,
): Promise<{ enriched: EnrichedLineItem[]; conversionNotes: string[] }> {
	const conversionNotes: string[] = [];

	const descriptions = [...new Set(items.map(i => (i.description ?? '').trim()).filter(Boolean))];
	const conversionMap = await loadConversionMap(supplierName, descriptions, restaurantId, supplierId);

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
