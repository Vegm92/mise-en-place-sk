import { describe, it, expect } from 'vitest';
import { hasMinDateRows, pageSignalsFromText } from '../src/lib/server/document-structure';

describe('hasMinDateRows', () => {
	it('returns false for text shorter than 10 characters', () => {
		expect(hasMinDateRows('', 1)).toBe(false);
		expect(hasMinDateRows('12/05/24', 1)).toBe(false);
		expect(hasMinDateRows('abc', 3)).toBe(false);
	});

	it('returns false when text contains fewer date rows than minCount', () => {
		const text = 'Listado de facturas: 12/05/2024 - 100 EUR, 15/05/2024 - 150 EUR.';
		expect(hasMinDateRows(text, 3)).toBe(false);
	});

	it('returns true when text contains at least minCount date rows', () => {
		const text = 'Listado de facturas: 12/05/2024 - 100 EUR, 15/05/2024 - 150 EUR, 20/05/2024 - 200 EUR.';
		expect(hasMinDateRows(text, 3)).toBe(true);
	});

	it('handles various date separators (dash, slash, dot)', () => {
		const text = 'Movimientos: 01-01-2024, 02/01/2024, 03.01.2024';
		expect(hasMinDateRows(text, 3)).toBe(true);
	});

	it('resets regex lastIndex state correctly across consecutive calls', () => {
		const text3 = 'Dates: 01/01/2024, 02/01/2024, 03/01/2024';
		const text0 = 'No dates here in this long enough text header string';

		expect(hasMinDateRows(text3, 3)).toBe(true);
		expect(hasMinDateRows(text0, 1)).toBe(false);
		expect(hasMinDateRows(text3, 3)).toBe(true);
	});
});

describe('pageSignalsFromText — cover page date row thresholds', () => {
	it('classifies cover page when cover phrase and >= 3 date rows are present', () => {
		const coverText = 'Resumen de facturas para restaurante. ' +
			'Factura 101 del 01/05/2024 por 500 EUR. ' +
			'Factura 102 del 05/05/2024 por 300 EUR. ' +
			'Factura 103 del 10/05/2024 por 200 EUR. ' +
			'Total a pagar del periodo correspondiente a este informe.';
		const docText = 'Factura F-2024-001 Proveedor SL NIF B12345678 Calle Mayor 1 Fecha: 12/05/2024 Impuesto 21% Total 100.00 EUR';

		const signals = pageSignalsFromText([coverText, docText]);
		expect(signals).not.toBeNull();
		expect(signals![0]!.role).toBe('cover');
		expect(signals![1]!.role).toBe('document');
	});

	it('does not classify as cover if cover phrase exists but < 3 date rows', () => {
		const text1 = 'Resumen de facturas del proveedor. Factura F-1001 Fecha: 10/05/2024 Total: 150.00 EUR NIF B12345678 Direccion Madrid';
		const text2 = 'Factura F-1002 Proveedor SL NIF B12345678 Calle Mayor 1 Fecha: 12/05/2024 Impuesto 21% Total 100.00 EUR';

		const signals = pageSignalsFromText([text1, text2]);
		expect(signals).not.toBeNull();
		expect(signals![0]!.role).toBe('document');
	});
});
