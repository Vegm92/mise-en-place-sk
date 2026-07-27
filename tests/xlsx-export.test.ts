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
