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

// Units that are already canonical — no DB rule needed, factor 1.
const CANONICAL_UNITS = new Set([
	'kg', 'g', 'mg',
	'L', 'l', 'ml', 'mL',
	'ud', 'uds', 'un', 'unidad', 'unidades',
	'pz', 'pza', 'pieza', 'piezas',
	'caja', 'cajas', 'bote', 'botes', 'bolsa', 'bolsas',
	'sobre', 'sobres', 'lata', 'latas', 'botella', 'botellas',
]);

export function resolveUnit(
	supplierName: string,
	description: string,
	unit: string
): { canonicalUnit: string; conversionFactor: number } | null {
	const normalizedSupplier = supplierName.trim().toLowerCase();
	const rows = db
		.select()
		.from(unitConversions)
		.where(
			and(
				eq(unitConversions.supplierName, normalizedSupplier),
				eq(unitConversions.ingredient, description),
				eq(unitConversions.purchaseUnit, unit)
			)
		)
		.limit(1)
		.all();
	if (rows[0]) return rows[0];

	// Fall back to pass-through for known canonical units.
	if (CANONICAL_UNITS.has(unit.trim())) {
		return { canonicalUnit: unit.trim(), conversionFactor: 1 };
	}
	return null;
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
