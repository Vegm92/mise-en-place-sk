import { describe, it, expect } from 'vitest';
import { sanitizeFormulaString, toCsv } from '../src/lib/reports';
import { buildInventoryWorkbook } from '../src/lib/server/inventory-template';

describe('sanitizeFormulaString', () => {
	it('prefixes strings starting with formula trigger characters (=, +, -, @, \\t, \\r) with a single quote', () => {
		expect(sanitizeFormulaString("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
		expect(sanitizeFormulaString('+34612345678')).toBe("'+34612345678");
		expect(sanitizeFormulaString('-10%')).toBe("'-10%");
		expect(sanitizeFormulaString('@SELECT')).toBe("'@SELECT");
		expect(sanitizeFormulaString('\tTabbed')).toBe("'\tTabbed");
		expect(sanitizeFormulaString('\rCarriage')).toBe("'\rCarriage");
	});

	it('leaves normal strings, null, and undefined unchanged', () => {
		expect(sanitizeFormulaString('Normal Supplier')).toBe('Normal Supplier');
		expect(sanitizeFormulaString('—')).toBe('—');
		expect(sanitizeFormulaString('')).toBe('');
		expect(sanitizeFormulaString(null)).toBeNull();
		expect(sanitizeFormulaString(undefined)).toBeUndefined();
	});
});

describe('CSV formula injection prevention', () => {
	it('neutralises formula injections in CSV export fields', () => {
		const header = ['Proveedor', 'Importe'];
		const rows = [
			["=cmd|'/c calc'!A1", 100],
			['+34600000000', -50.2],
			['@admin', 0]
		];

		const csv = toCsv(header, rows);
		expect(csv).toContain("'=cmd|'/c calc'!A1");
		expect(csv).toContain("'+34600000000");
		expect(csv).toContain("'@admin");
		expect(csv).toContain('-50,20');
		expect(csv).not.toContain("'-50,20");
	});

	it('escapes quotes and delimiters in formula payloads safely', () => {
		const header = ['Formula with delimiter'];
		const rows = [
			['=SUM(A1;B1)'],
			['=HYPERLINK("http://evil.com")']
		];

		const csv = toCsv(header, rows);
		expect(csv).toContain('"\'=SUM(A1;B1)"');
		expect(csv).toContain('"\'=HYPERLINK(""http://evil.com"")"');
	});
});

describe('XLSX formula injection prevention', () => {
	it('neutralises formula injections in inventory template catalog rows', () => {
		const rows = [
			{
				id: 1,
				category: '=cmd|cat',
				canonicalName: '+dangerous product',
				canonicalUnit: '@kg',
				unitPrice: 12.5,
				taxRatePct: 10,
				taxKind: 'iva',
				formatCount: 1,
				lastPurchasedAt: '2026-03-01'
			}
		];

		const wb = buildInventoryWorkbook(rows, 'es');
		const sheet = wb.getWorksheet('Inventario')!;
		const row = sheet.getRow(2);

		expect(row.getCell('category').value).toBe("'=cmd|cat");
		expect(row.getCell('product').value).toBe("'+dangerous product");
		expect(row.getCell('unit').value).toBe("'@kg");
	});
});
