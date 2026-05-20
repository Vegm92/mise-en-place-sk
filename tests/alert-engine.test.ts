/**
 * Alert engine tests — business rules for price shock and stock forecast.
 * Mocks the db module with an in-memory SQLite DB so no real file is touched.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

let testClient: InstanceType<typeof Database>;

vi.mock('../src/lib/server/db', async () => {
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	return {
		get dbClient() { return testClient; },
		get db() { return drizzle(testClient); },
	};
});

import { runPriceShock, runStockForecast } from '../src/lib/server/alert-engine';

const SCHEMA_SQL = `
	CREATE TABLE IF NOT EXISTS suppliers (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS invoices (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		supplier_id INTEGER REFERENCES suppliers(id),
		invoice_date TEXT,
		total_amount REAL,
		status TEXT DEFAULT 'pending'
	);
	CREATE TABLE IF NOT EXISTS invoice_line_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		invoice_id INTEGER REFERENCES invoices(id),
		description TEXT,
		quantity REAL,
		unit TEXT,
		unit_price REAL,
		total_price REAL,
		requires_unit_conversion INTEGER NOT NULL DEFAULT 0,
		canonical_unit TEXT
	);
	CREATE TABLE IF NOT EXISTS stock_levels (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ingredient TEXT NOT NULL UNIQUE,
		current_stock REAL NOT NULL DEFAULT 0,
		canonical_unit TEXT,
		daily_burn_rate REAL NOT NULL DEFAULT 0,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
`;

function seedPreviousInvoice(
	supplierName: string,
	ingredient: string,
	unitPrice: number,
	invoiceId: number
) {
	testClient.exec(`INSERT OR IGNORE INTO suppliers (id, name) VALUES (1, '${supplierName}')`);
	testClient.exec(
		`INSERT INTO invoices (id, supplier_id, invoice_date) VALUES (${invoiceId}, 1, '2024-01-01')`
	);
	testClient.exec(
		`INSERT INTO invoice_line_items (invoice_id, description, unit_price) VALUES (${invoiceId}, '${ingredient}', ${unitPrice})`
	);
}

beforeEach(() => {
	testClient = new Database(':memory:');
	testClient.exec(SCHEMA_SQL);
});

describe('runPriceShock', () => {
	it('fires alert when price increases more than 15%', () => {
		seedPreviousInvoice('Proveedor SA', 'Aceite de oliva', 80, 1);

		const alerts = runPriceShock(2, 'Proveedor SA', [
			{ description: 'Aceite de oliva', unitPrice: 95, quantity: 1, unit: 'L', totalPrice: 95, canonicalUnit: null, requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(1);
		expect(alerts[0].notificationType).toBe('price_shock');
		expect(alerts[0].payload.oldPrice).toBe(80);
		expect(alerts[0].payload.newPrice).toBe(95);
	});

	it('fires alert when price decreases more than 15%', () => {
		seedPreviousInvoice('Proveedor SA', 'Aceite de oliva', 100, 1);

		const alerts = runPriceShock(2, 'Proveedor SA', [
			{ description: 'Aceite de oliva', unitPrice: 80, quantity: 1, unit: 'L', totalPrice: 80, canonicalUnit: null, requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(1);
		expect(alerts[0].notificationType).toBe('price_shock');
	});

	it('does not fire when price change is within 15%', () => {
		seedPreviousInvoice('Proveedor SA', 'Sal fina', 10, 1);

		const alerts = runPriceShock(2, 'Proveedor SA', [
			{ description: 'Sal fina', unitPrice: 11, quantity: 1, unit: 'kg', totalPrice: 11, canonicalUnit: null, requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(0);
	});

	it('handles no previous price record gracefully', () => {
		const alerts = runPriceShock(1, 'Nuevo Proveedor', [
			{ description: 'Aceite de oliva', unitPrice: 90, quantity: 1, unit: 'L', totalPrice: 90, canonicalUnit: null, requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(0);
	});

	it('skips line items with null unit price', () => {
		seedPreviousInvoice('Proveedor SA', 'Aceite de oliva', 80, 1);

		const alerts = runPriceShock(2, 'Proveedor SA', [
			{ description: 'Aceite de oliva', unitPrice: null, quantity: 1, unit: 'L', totalPrice: null, canonicalUnit: null, requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(0);
	});

	it('skips line items with empty description', () => {
		const alerts = runPriceShock(1, 'Proveedor SA', [
			{ description: '', unitPrice: 100, quantity: 1, unit: 'L', totalPrice: 100, canonicalUnit: null, requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(0);
	});
});

describe('runStockForecast', () => {
	it('fires alert when projected days of stock is below 3', () => {
		testClient.exec(
			`INSERT INTO stock_levels (ingredient, current_stock, daily_burn_rate) VALUES ('Aceite de oliva', 1, 1)`
		);

		const alerts = runStockForecast([
			{ description: 'Aceite de oliva', quantity: 1, unitPrice: 10, unit: 'L', totalPrice: 10, canonicalUnit: 'L', requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(1);
		expect(alerts[0].notificationType).toBe('low_stock_forecast');
		expect(alerts[0].payload.projectedDays).toBeLessThan(3);
	});

	it('does not fire when projected days is at or above 3', () => {
		testClient.exec(
			`INSERT INTO stock_levels (ingredient, current_stock, daily_burn_rate) VALUES ('Aceite de oliva', 10, 1)`
		);

		const alerts = runStockForecast([
			{ description: 'Aceite de oliva', quantity: 5, unitPrice: 10, unit: 'L', totalPrice: 50, canonicalUnit: 'L', requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(0);
	});

	it('does not divide by zero when daily_burn_rate is 0', () => {
		testClient.exec(
			`INSERT INTO stock_levels (ingredient, current_stock, daily_burn_rate) VALUES ('Sal fina', 5, 0)`
		);

		const alerts = runStockForecast([
			{ description: 'Sal fina', quantity: 1, unitPrice: 2, unit: 'kg', totalPrice: 2, canonicalUnit: 'kg', requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(0);
	});

	it('skips ingredient not in stock_levels', () => {
		const alerts = runStockForecast([
			{ description: 'Producto desconocido', quantity: 1, unitPrice: 5, unit: 'unit', totalPrice: 5, canonicalUnit: null, requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(0);
	});

	it('skips line items with empty description', () => {
		const alerts = runStockForecast([
			{ description: '', quantity: 1, unitPrice: 5, unit: 'unit', totalPrice: 5, canonicalUnit: null, requiresUnitConversion: false },
		]);

		expect(alerts).toHaveLength(0);
	});
});
