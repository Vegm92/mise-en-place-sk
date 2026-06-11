/**
 * Unit Bridge — resolves purchase units (invoices) to canonical units.
 * Queries unit_conversions and annotates line items in place.
 */
import { db } from './db';
import { unitConversions } from './schema';
import { and, eq, inArray } from 'drizzle-orm';

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

// Units that are already canonical — no DB rule needed, factor 1.
const CANONICAL_UNITS = new Set([
	'kg', 'g', 'mg',
	'L', 'l', 'ml', 'mL',
	'ud', 'uds', 'un', 'unidad', 'unidades',
	'pz', 'pza', 'pieza', 'piezas',
	'caja', 'cajas', 'bote', 'botes', 'bolsa', 'bolsas',
	'sobre', 'sobres', 'lata', 'latas', 'botella', 'botellas',
]);

export async function resolveUnit(
	supplierName: string,
	description: string,
	unit: string,
	restaurantId: string,
): Promise<{ canonicalUnit: string; conversionFactor: number } | null> {
	const normalizedSupplier = supplierName.trim().toLowerCase();
	const rows = await db
		.select()
		.from(unitConversions)
		.where(
			and(
				eq(unitConversions.restaurantId, restaurantId),
				eq(unitConversions.supplierName, normalizedSupplier),
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
): Promise<Map<string, { canonicalUnit: string; conversionFactor: number }>> {
	const normalizedSupplier = supplierName.trim().toLowerCase();
	if (descriptions.length === 0) return new Map();

	const rows = await db
		.select()
		.from(unitConversions)
		.where(
			and(
				eq(unitConversions.restaurantId, restaurantId),
				eq(unitConversions.supplierName, normalizedSupplier),
				inArray(unitConversions.ingredient, descriptions),
			)
		);

	const map = new Map<string, { canonicalUnit: string; conversionFactor: number }>();
	for (const row of rows) {
		map.set(`${row.ingredient}::${row.purchaseUnit}`, { canonicalUnit: row.canonicalUnit, conversionFactor: row.conversionFactor });
	}
	return map;
}

export function resolveUnitFromMap(
	conversionMap: Map<string, { canonicalUnit: string; conversionFactor: number }>,
	description: string,
	unit: string,
): { canonicalUnit: string; conversionFactor: number } | null {
	const rule = conversionMap.get(`${description}::${unit}`);
	if (rule) return rule;
	if (CANONICAL_UNITS.has(unit.trim())) {
		return { canonicalUnit: unit.trim(), conversionFactor: 1 };
	}
	return null;
}

export async function annotateLineItems(
	supplierName: string,
	items: LineItem[],
	restaurantId: string,
): Promise<{ enriched: EnrichedLineItem[]; conversionNotes: string[] }> {
	const conversionNotes: string[] = [];

	const descriptions = [...new Set(items.map(i => (i.description ?? '').trim()).filter(Boolean))];
	const conversionMap = await loadConversionMap(supplierName, descriptions, restaurantId);

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
