/**
 * Unit bridge tests — resolveUnit and annotateLineItems against an in-memory DB.
 * Mocks the db module so no real file is touched.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/lib/server/schema';

let testClient: InstanceType<typeof Database>;
let testDrizzle: ReturnType<typeof drizzle<typeof schema>>;

vi.mock('../src/lib/server/db', () => ({
	get db() {
		return testDrizzle;
	},
}));

import { resolveUnit, annotateLineItems } from '../src/lib/server/unit-bridge';

const UNIT_CONVERSIONS_SCHEMA = `
	CREATE TABLE IF NOT EXISTS unit_conversions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		supplier_name TEXT NOT NULL,
		ingredient TEXT NOT NULL,
		purchase_unit TEXT NOT NULL,
		canonical_unit TEXT NOT NULL,
		conversion_factor REAL NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(supplier_name, ingredient, purchase_unit)
	);
`;

function insertConversion(
	supplierName: string,
	ingredient: string,
	purchaseUnit: string,
	canonicalUnit: string,
	factor: number
) {
	testClient.prepare(
		`INSERT INTO unit_conversions (supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor)
		 VALUES (?, ?, ?, ?, ?)`
	).run(supplierName.trim().toLowerCase(), ingredient, purchaseUnit, canonicalUnit, factor);
}

beforeEach(() => {
	testClient = new Database(':memory:');
	testClient.exec(UNIT_CONVERSIONS_SCHEMA);
	testDrizzle = drizzle(testClient, { schema });
});

describe('resolveUnit', () => {
	it('returns conversion rule when one exists', () => {
		insertConversion('proveedor sa', 'Aceite de oliva', 'garrafa', 'L', 5);

		const result = resolveUnit('Proveedor SA', 'Aceite de oliva', 'garrafa');
		expect(result).not.toBeNull();
		expect(result?.canonicalUnit).toBe('L');
		expect(result?.conversionFactor).toBe(5);
	});

	it('returns null when no rule exists', () => {
		const result = resolveUnit('Proveedor SA', 'Producto desconocido', 'barril');
		expect(result).toBeNull();
	});

	it('normalizes supplier name to lowercase for lookup', () => {
		insertConversion('proveedor sa', 'Sal fina', 'saco', 'kg', 25);

		const result = resolveUnit('PROVEEDOR SA', 'Sal fina', 'saco');
		expect(result).not.toBeNull();
		expect(result?.conversionFactor).toBe(25);
	});

	it('handles unicode and special characters in supplier name', () => {
		insertConversion('distribuciones garcía & cía.', 'Aceite', 'garrafa', 'L', 5);

		const result = resolveUnit('Distribuciones García & Cía.', 'Aceite', 'garrafa');
		expect(result).not.toBeNull();
		expect(result?.canonicalUnit).toBe('L');
	});
});

describe('annotateLineItems', () => {
	it('applies conversion factor when rule exists', () => {
		insertConversion('proveedor sa', 'Aceite de oliva', 'garrafa', 'L', 5);

		const { enriched } = annotateLineItems('Proveedor SA', [
			{ description: 'Aceite de oliva', quantity: 10, unit: 'garrafa', unitPrice: 25, totalPrice: 250 },
		]);

		expect(enriched[0].requiresUnitConversion).toBe(false);
		expect(enriched[0].canonicalUnit).toBe('L');
		expect(enriched[0].convertedQuantity).toBe(50);
		expect(enriched[0].convertedUnitPrice).toBe(5);
	});

	it('marks item as requiring conversion when no rule exists', () => {
		const { enriched, conversionNotes } = annotateLineItems('Proveedor SA', [
			{ description: 'Producto nuevo', quantity: 3, unit: 'barril', unitPrice: 10, totalPrice: 30 },
		]);

		expect(enriched[0].requiresUnitConversion).toBe(true);
		expect(enriched[0].canonicalUnit).toBeNull();
		expect(conversionNotes).toHaveLength(1);
		expect(conversionNotes[0]).toContain('barril');
	});

	it('skips conversion for items with no unit', () => {
		const { enriched } = annotateLineItems('Proveedor SA', [
			{ description: 'Servicio limpieza', quantity: 1, unit: null, unitPrice: 50, totalPrice: 50 },
		]);

		expect(enriched[0].requiresUnitConversion).toBe(false);
		expect(enriched[0].canonicalUnit).toBeNull();
	});

	it('skips conversion for items with no description', () => {
		const { enriched } = annotateLineItems('Proveedor SA', [
			{ description: '', quantity: 1, unit: 'kg', unitPrice: 5, totalPrice: 5 },
		]);

		expect(enriched[0].requiresUnitConversion).toBe(false);
	});

	it('handles null quantity gracefully', () => {
		insertConversion('proveedor sa', 'Aceite de oliva', 'garrafa', 'L', 5);

		const { enriched } = annotateLineItems('Proveedor SA', [
			{ description: 'Aceite de oliva', quantity: null, unit: 'garrafa', unitPrice: 25, totalPrice: null },
		]);

		expect(enriched[0].convertedQuantity).toBeNull();
		expect(enriched[0].convertedUnitPrice).toBe(5);
	});

	it('handles mixed items — some with rules, some without', () => {
		insertConversion('proveedor sa', 'Aceite de oliva', 'garrafa', 'L', 5);

		const { enriched, conversionNotes } = annotateLineItems('Proveedor SA', [
			{ description: 'Aceite de oliva', quantity: 2, unit: 'garrafa', unitPrice: 25, totalPrice: 50 },
			{ description: 'Producto sin regla', quantity: 1, unit: 'palet', unitPrice: 100, totalPrice: 100 },
		]);

		expect(enriched[0].requiresUnitConversion).toBe(false);
		expect(enriched[1].requiresUnitConversion).toBe(true);
		expect(conversionNotes).toHaveLength(1);
	});
});
