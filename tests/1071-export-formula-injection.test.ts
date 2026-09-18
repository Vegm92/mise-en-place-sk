/**
 * Issue #1071 — CSV and XLSX exports must not carry executable formulas.
 *
 * Supplier names and line-item text reach the database from uploaded or
 * WhatsApp-delivered invoices via model-based extraction, which is not a
 * sanitising step. A supplier whose name is a dynamic-data-exchange payload
 * (`=cmd|'/c calc'!A1`) therefore lands in the export, and the payload runs on
 * the bookkeeper's workstation when they open the file — outside this app's
 * trust boundary.
 *
 * tests/csv-xlsx-formula-injection.test.ts covers `sanitizeFormulaString` and
 * the inventory workbook directly. This suite closes the acceptance criterion
 * instead: the same payload, carried as a *supplier name* end to end through
 * both real export routes, asserted on the bytes those routes return — the
 * parsed .xlsx cell for the invoices download, the encoded CSV field for the
 * extraction-corrections export. Ordinary supplier names are asserted
 * unchanged in both, so the guard cannot be widened into a formatting change.
 *
 * Skipped without DATABASE_URL.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

const DDE_PAYLOAD = "=cmd|'/c calc'!A1";
const ORDINARY_SUPPLIER = 'Distribuciones García S.L.';
const DDE_INVOICE_NUMBER = 'INV-1071-DDE';
const ORDINARY_INVOICE_NUMBER = 'INV-1071-OK';
const DDE_FIELD = 'supplier_name_1071_dde';
const ORDINARY_FIELD = 'supplier_name_1071_ok';

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true), checkAuthRateLimit: vi.fn().mockResolvedValue(true) }));

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

vi.mock('$lib/server/storage', () => ({
	getStorage: () => ({ read: async () => Buffer.from('stub') }),
}));

// trackEvent is fire-and-forget: its insert can land after afterAll has
// deleted the restaurant, logging a foreign-key error that is pure noise here.
vi.mock('$lib/server/events', () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }));

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('formula1071');
	rid = r.id;

	const [dde] = await testSql`
		INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, ${DDE_PAYLOAD}) RETURNING id
	`;
	const [ordinary] = await testSql`
		INSERT INTO suppliers (restaurant_id, name) VALUES (${rid}, ${ORDINARY_SUPPLIER}) RETURNING id
	`;

	await testSql`
		INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status)
		VALUES
			(${rid}, ${dde!.id},      ${DDE_INVOICE_NUMBER},      '2026-02-02', 100, 'pending'),
			(${rid}, ${ordinary!.id}, ${ORDINARY_INVOICE_NUMBER}, '2026-02-01', 200, 'pending')
	`;

	await testSql`
		INSERT INTO extraction_corrections
			(restaurant_id, supplier_id, field_name, original_value, corrected_value)
		VALUES
			(${rid}, ${dde!.id},      ${DDE_FIELD},      ${DDE_PAYLOAD},      ${DDE_PAYLOAD}),
			(${rid}, ${ordinary!.id}, ${ORDINARY_FIELD}, ${ORDINARY_SUPPLIER}, ${ORDINARY_SUPPLIER})
	`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

async function xlsxSupplierCells(): Promise<Map<string, ExcelJS.Cell>> {
	const { GET } = await import('../src/routes/(app)/invoices/export/download/+server');
	const res = (await GET({
		url: new URL('https://app.test/invoices/export/download'),
		locals: { restaurantId: rid },
	} as never)) as Response;
	expect(res.status).toBe(200);

	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(
		Buffer.from(await res.arrayBuffer()) as unknown as Parameters<typeof wb.xlsx.load>[0],
	);
	const sheet = wb.getWorksheet('Albaranes');
	if (!sheet) throw new Error('Albaranes sheet missing');

	// Column *keys* are a write-time construct and do not survive the xlsx
	// round-trip, so the two columns are located by their header label.
	const header = sheet.getRow(1);
	const columnOf = (label: string): number => {
		for (let c = 1; c <= header.cellCount; c++) {
			if (header.getCell(c).value === label) return c;
		}
		throw new Error(`column "${label}" missing from the export`);
	};
	const invoiceNumberColumn = columnOf('Nº albarán');
	const supplierColumn = columnOf('Proveedor');

	const byInvoiceNumber = new Map<string, ExcelJS.Cell>();
	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		byInvoiceNumber.set(String(row.getCell(invoiceNumberColumn).value), row.getCell(supplierColumn));
	});
	return byInvoiceNumber;
}

async function csvRowsByField(): Promise<Map<string, string[]>> {
	const { GET } = await import('../src/routes/(app)/analytics/extraction/csv/+server');
	const res = (await GET({ locals: { restaurantId: rid } } as never)) as Response;
	expect(res.status).toBe(200);

	const body = await res.text();
	const byField = new Map<string, string[]>();
	for (const line of body.replace(/^﻿/, '').split('\r\n')) {
		if (!line) continue;
		const fields = line.split(';');
		if (fields[3]) byField.set(fields[3], fields);
	}
	return byField;
}

describe.skipIf(!hasDbEnv)('issue #1071 — a DDE supplier name exports inert in both formats', () => {
	it('writes the payload as an inert string cell in the invoices XLSX export', async () => {
		const cell = (await xlsxSupplierCells()).get(DDE_INVOICE_NUMBER);
		if (!cell) throw new Error(`no exported row for ${DDE_INVOICE_NUMBER}`);

		expect(cell.type).toBe(ExcelJS.ValueType.String);
		expect(cell.formula).toBeUndefined();
		expect(cell.value).toBe(`'${DDE_PAYLOAD}`);
		expect(String(cell.value).startsWith('=')).toBe(false);
	});

	it('writes the payload as an inert field in the extraction-corrections CSV export', async () => {
		const fields = (await csvRowsByField()).get(DDE_FIELD);
		if (!fields) throw new Error(`no exported row for ${DDE_FIELD}`);

		expect(fields[1]).toBe(`'${DDE_PAYLOAD}`);
		expect(fields[5]).toBe(`'${DDE_PAYLOAD}`);
		expect(fields[6]).toBe(`'${DDE_PAYLOAD}`);
		expect(fields[1]!.startsWith('=')).toBe(false);
	});

	it('leaves an ordinary supplier name byte-identical in the XLSX export', async () => {
		const cell = (await xlsxSupplierCells()).get(ORDINARY_INVOICE_NUMBER);
		if (!cell) throw new Error(`no exported row for ${ORDINARY_INVOICE_NUMBER}`);

		expect(cell.type).toBe(ExcelJS.ValueType.String);
		expect(cell.value).toBe(ORDINARY_SUPPLIER);
	});

	it('leaves an ordinary supplier name byte-identical in the CSV export', async () => {
		const fields = (await csvRowsByField()).get(ORDINARY_FIELD);
		if (!fields) throw new Error(`no exported row for ${ORDINARY_FIELD}`);

		expect(fields[1]).toBe(ORDINARY_SUPPLIER);
		expect(fields[5]).toBe(ORDINARY_SUPPLIER);
		expect(fields[6]).toBe(ORDINARY_SUPPLIER);
	});
});
