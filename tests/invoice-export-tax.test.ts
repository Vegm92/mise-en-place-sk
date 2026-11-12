import { describe, it, expect } from 'vitest';
import { summarizeInvoiceTax } from '../src/lib/server/invoice-export-tax';

describe('summarizeInvoiceTax — gestoría export (F10)', () => {
	it('returns empty values when there is no stored breakdown', () => {
		expect(summarizeInvoiceTax(null)).toEqual({ vatRates: null, vatAmount: null, recAmount: null });
		expect(summarizeInvoiceTax('not json')).toEqual({ vatRates: null, vatAmount: null, recAmount: null });
		expect(summarizeInvoiceTax('[]')).toEqual({ vatRates: null, vatAmount: null, recAmount: null });
	});

	it('sums IVA cuota across bands and lists each distinct rate in ascending order', () => {
		const raw = JSON.stringify([
			{ rate: 0.21, base: 50, tax_amount: 10.5, type: 'iva' },
			{ rate: 0.10, base: 100, tax_amount: 10, type: 'iva' },
			{ rate: 0.10, base: 20, tax_amount: 2, type: 'iva' },
		]);
		expect(summarizeInvoiceTax(raw)).toEqual({ vatRates: '10 / 21', vatAmount: 22.5, recAmount: null });
	});

	it('keeps recargo de equivalencia out of the IVA cuota and reports it separately', () => {
		const raw = JSON.stringify([
			{ rate: 0.10, base: 100, tax_amount: 10, type: 'iva' },
			{ rate: 0.014, base: 100, tax_amount: 1.4, type: 'rec' },
		]);
		expect(summarizeInvoiceTax(raw)).toEqual({ vatRates: '10', vatAmount: 10, recAmount: 1.4 });
	});

	it('treats an untyped band as IVA and prints decimal rates with a comma', () => {
		const raw = JSON.stringify([{ rate: 0.055, base: 100, tax_amount: 5.5 }]);
		expect(summarizeInvoiceTax(raw)).toEqual({ vatRates: '5,5', vatAmount: 5.5, recAmount: null });
	});

	it('includes an exempt 0% band', () => {
		const raw = JSON.stringify([
			{ rate: 0, base: 30, tax_amount: 0, type: 'iva' },
			{ rate: 0.04, base: 25, tax_amount: 1, type: 'iva' },
		]);
		expect(summarizeInvoiceTax(raw)).toEqual({ vatRates: '0 / 4', vatAmount: 1, recAmount: null });
	});
});
