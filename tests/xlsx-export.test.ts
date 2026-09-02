/**
 * Excel export smoke test (issue #225).
 *
 * The dependency-hygiene pass pins patched transitive versions through
 * `pnpm.overrides`, and two of them land on exceljs's archiver stack: `uuid`
 * jumps 8 → 11 and `brace-expansion` 1.x/2.x → 5.x. Those are major versions
 * exceljs never chose, and a break there surfaces as a corrupt or empty
 * download — not as an error anyone would notice in CI.
 *
 * So: actually build a workbook and read it back.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildInventoryWorkbook } from '../src/lib/server/inventory-template';
import type { CatalogExportRow } from '../src/lib/server/products';

async function buildWorkbook() {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Facturas');
	ws.columns = [
		{ header: 'Proveedor', key: 'supplier', width: 24 },
		{ header: 'Nº factura', key: 'number', width: 16 },
		{ header: 'Total', key: 'total', width: 12 },
	];
	ws.addRow({ supplier: 'Frutas Gómez S.L.', number: 'FAC-2026-001', total: 1250.5 });
	ws.addRow({ supplier: 'Lácteos del Norte', number: 'FAC-2026-002', total: 340.25 });
	return wb;
}

describe('xlsx export', () => {
	it('writes a well-formed workbook', async () => {
		const buffer = Buffer.from(await (await buildWorkbook()).xlsx.writeBuffer());
		expect(buffer.byteLength).toBeGreaterThan(0);
		// xlsx is a zip: no "PK" means the archive stack produced garbage.
		expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
	});

	it('round-trips values and accents through the archive', async () => {
		const buffer = await (await buildWorkbook()).xlsx.writeBuffer();

		const reopened = new ExcelJS.Workbook();
		await reopened.xlsx.load(buffer);
		const sheet = reopened.getWorksheet('Facturas');
		expect(sheet).toBeDefined();

		expect(sheet!.getRow(2).getCell(1).value).toBe('Frutas Gómez S.L.');
		expect(sheet!.getRow(2).getCell(2).value).toBe('FAC-2026-001');
		expect(sheet!.getRow(2).getCell(3).value).toBe(1250.5);
		expect(sheet!.getRow(3).getCell(1).value).toBe('Lácteos del Norte');
	});
});

/**
 * buildInventoryWorkbook (issue #885) — the pure generator behind
 * /products/inventory-template, tested without a request so category
 * grouping/ordering, subtotal formulas and the grand-total formula can be
 * pinned on the actual workbook bytes rather than mocked.
 */
describe('buildInventoryWorkbook (issue #885)', () => {
	const rows: CatalogExportRow[] = [
		{ id: 1, canonicalName: 'Ternera aguja', category: 'Carnes y Derivados', canonicalUnit: 'kg', unitPrice: 12.5 },
		{ id: 2, canonicalName: 'Tomate pera',    category: 'Frutas y Verduras',  canonicalUnit: 'kg', unitPrice: 2 },
		{ id: 3, canonicalName: 'Lechuga',         category: 'Frutas y Verduras', canonicalUnit: 'ud', unitPrice: null },
		{ id: 4, canonicalName: 'Bolsa mixta',      category: null,                canonicalUnit: 'ud', unitPrice: 0.1 },
	];

	async function buildAndReopen(locale: 'es' | 'en' = 'es') {
		const wb = buildInventoryWorkbook(rows, locale);
		const buffer = await wb.xlsx.writeBuffer();
		const reopened = new ExcelJS.Workbook();
		await reopened.xlsx.load(buffer as unknown as Parameters<typeof reopened.xlsx.load>[0]);
		const sheet = reopened.getWorksheet('Inventario');
		if (!sheet) throw new Error('Inventario sheet missing');
		return { buffer, sheet };
	}

	it('writes a well-formed zip', async () => {
		const { buffer } = await buildAndReopen();
		expect(buffer.byteLength).toBeGreaterThan(0);
		expect(Buffer.from(buffer).subarray(0, 2).toString('latin1')).toBe('PK');
	});

	it('has the header row and one data row per product, grouped by category (Frutas before Carnes, uncategorized last) with per-row Total formulas', async () => {
		const { sheet } = await buildAndReopen('es');

		expect(sheet.getRow(1).getCell(1).value).toBe('Categoría');
		expect(sheet.getRow(1).getCell(6).value).toBe('Total (€)');

		// Frutas y Verduras (VALID_CATEGORIES index 0) sorts before Carnes y
		// Derivados (index 1) even though the input array lists Carnes first;
		// the uncategorized product sorts after every named category.
		expect(sheet.getRow(2).getCell(2).value).toBe('Tomate pera');
		expect(sheet.getRow(2).getCell(1).value).toBe('Frutas y Verduras');
		expect(sheet.getRow(3).getCell(2).value).toBe('Lechuga');
		expect(sheet.getRow(5).getCell(2).value).toBe('Ternera aguja');
		expect(sheet.getRow(5).getCell(1).value).toBe('Carnes y Derivados');

		const tomateTotal = sheet.getRow(2).getCell(6).value as { formula?: string };
		expect(tomateTotal.formula).toBe('D2*E2');
		const terneraRowNumber = sheet.getRow(5).number;
		const terneraTotal = sheet.getRow(5).getCell(6).value as { formula?: string };
		expect(terneraTotal.formula).toBe(`D${terneraRowNumber}*E${terneraRowNumber}`);

		expect(sheet.getRow(2).getCell(5).value).toBeNull(); // Cantidad contada starts empty
	});

	it('adds a subtotal row per category and a grand-total row summing the subtotals', async () => {
		const { sheet } = await buildAndReopen('es');

		const subtotalRows = [];
		for (let r = 1; r <= sheet.rowCount; r++) {
			const label = sheet.getRow(r).getCell(2).value;
			if (typeof label === 'string' && label.startsWith('Subtotal ')) subtotalRows.push(r);
		}
		expect(subtotalRows).toHaveLength(3); // Frutas, uncategorized, Carnes

		for (const r of subtotalRows) {
			const cell = sheet.getRow(r).getCell(6).value as { formula?: string };
			expect(cell.formula).toMatch(/^SUM\(F\d+:F\d+\)$/);
		}

		const lastRow = sheet.getRow(sheet.rowCount);
		expect(lastRow.getCell(2).value).toBe('Total general');
		const grandTotal = lastRow.getCell(6).value as { formula?: string };
		expect(grandTotal.formula).toMatch(/^SUM\(F\d+(,F\d+)*\)$/);
	});

	it('translates category labels through the request locale', async () => {
		const { sheet } = await buildAndReopen('en');
		expect(sheet.getRow(2).getCell(1).value).toBe('Fruit & vegetables');
		expect(sheet.getRow(5).getCell(1).value).toBe('Meat & meat products');
	});
});
