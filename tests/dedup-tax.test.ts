import { describe, it, expect } from 'vitest';
import { computeInvoiceContentHash, canonicalTaxBands } from '../src/lib/server/dedup';
import { computeFormContentHash } from '../src/lib/server/invoice-save';
import { hashForStoredInvoice } from '../src/lib/server/rehash';
import type { TaxBand } from '../src/lib/tax';

const header = {
  supplierName: 'Distribuciones García S.L.',
  invoiceNumber: '',
  invoiceDate: '2024-11-14',
  dueDate: null,
  totalAmount: '539.30',
};

const lines = {
  lineDescriptions: ['Tomate rama', 'Merluza fresca'],
  lineQuantities: [12, 6.5],
  lineUnits: ['kg', 'kg'],
  lineUnitPrices: ['2.45', '14.20'],
  lineTotalPrices: ['29.40', '92.30'],
};

const IVA_10: TaxBand[] = [{ rate: 0.1, base: 121.7, tax_amount: 12.17, type: 'iva' }];
const IVA_21: TaxBand[] = [{ rate: 0.21, base: 121.7, tax_amount: 25.56, type: 'iva' }];

describe('content hash covers the tax (issue: albarán and factura are not the same document)', () => {
  it('separates a document with tax from the same lines without it', () => {
    const untaxed = computeInvoiceContentHash({ ...header, ...lines });
    const taxed = computeInvoiceContentHash({ ...header, ...lines, taxBands: IVA_10 });
    expect(taxed).not.toBe(untaxed);
  });

  it('separates two documents that differ only in the rate', () => {
    expect(computeInvoiceContentHash({ ...header, ...lines, taxBands: IVA_10 }))
      .not.toBe(computeInvoiceContentHash({ ...header, ...lines, taxBands: IVA_21 }));
  });

  it('separates an IVA band from a REC band at the same rate', () => {
    const iva: TaxBand[] = [{ rate: 0.014, base: 100, tax_amount: 1.4, type: 'iva' }];
    const rec: TaxBand[] = [{ rate: 0.014, base: 100, tax_amount: 1.4, type: 'rec' }];
    expect(computeInvoiceContentHash({ ...header, ...lines, taxBands: iva }))
      .not.toBe(computeInvoiceContentHash({ ...header, ...lines, taxBands: rec }));
  });

  it('separates documents whose lines carry different rates', () => {
    expect(computeInvoiceContentHash({ ...header, ...lines, lineTaxRates: [0.1, 0.1] }))
      .not.toBe(computeInvoiceContentHash({ ...header, ...lines, lineTaxRates: [0.1, 0.21] }));
  });

  it('still treats the same document as the same, whatever order the bands are in', () => {
    const a: TaxBand[] = [
      { rate: 0.21, base: 100, tax_amount: 21, type: 'iva' },
      { rate: 0.1, base: 50, tax_amount: 5, type: 'iva' },
    ];
    const b: TaxBand[] = [a[1]!, a[0]!];
    expect(computeInvoiceContentHash({ ...header, ...lines, taxBands: a }))
      .toBe(computeInvoiceContentHash({ ...header, ...lines, taxBands: b }));
  });

  it('treats no bands and an empty band list alike', () => {
    expect(canonicalTaxBands([])).toBeNull();
    expect(computeInvoiceContentHash({ ...header, ...lines, taxBands: [] }))
      .toBe(computeInvoiceContentHash({ ...header, ...lines, taxBands: null }));
  });

  it('is insensitive to money written with different precision', () => {
    const a: TaxBand[] = [{ rate: 0.1, base: 121.7, tax_amount: 12.17, type: 'iva' }];
    const b: TaxBand[] = [{ rate: 0.1, base: 121.70, tax_amount: 12.170, type: 'iva' }];
    expect(computeInvoiceContentHash({ ...header, ...lines, taxBands: a }))
      .toBe(computeInvoiceContentHash({ ...header, ...lines, taxBands: b }));
  });
});

describe('computeFormContentHash', () => {
  function form(entries: Array<[string, string]>): FormData {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  }

  const twoLines: Array<[string, string]> = [
    ['line_descriptions', 'Tomate rama'], ['line_quantities', '12'], ['line_units', 'kg'],
    ['line_unit_prices', '2.45'], ['line_total_prices', '29.40'], ['line_tax_rates', '0.1'],
    ['line_descriptions', 'Merluza fresca'], ['line_quantities', '6.5'], ['line_units', 'kg'],
    ['line_unit_prices', '14.20'], ['line_total_prices', '92.30'], ['line_tax_rates', '0.1'],
  ];

  it('keeps line columns aligned when a blank description sits between real ones', () => {
    const withBlank: Array<[string, string]> = [
      ['line_descriptions', 'Tomate rama'], ['line_quantities', '12'], ['line_units', 'kg'],
      ['line_unit_prices', '2.45'], ['line_total_prices', '29.40'], ['line_tax_rates', '0.1'],
      ['line_descriptions', ''], ['line_quantities', '99'], ['line_units', 'caja'],
      ['line_unit_prices', '9.99'], ['line_total_prices', '999.00'], ['line_tax_rates', '0.21'],
      ['line_descriptions', 'Merluza fresca'], ['line_quantities', '6.5'], ['line_units', 'kg'],
      ['line_unit_prices', '14.20'], ['line_total_prices', '92.30'], ['line_tax_rates', '0.1'],
    ];
    expect(computeFormContentHash(header, form(withBlank)))
      .toBe(computeFormContentHash(header, form(twoLines)));
  });

  it('feeds the bands it is given into the hash', () => {
    expect(computeFormContentHash(header, form(twoLines), IVA_10))
      .not.toBe(computeFormContentHash(header, form(twoLines), null));
  });
});

describe('hashForStoredInvoice (the backfill agrees with the save path)', () => {
  it('reproduces the hash a save would have written', () => {
    const fd = new FormData();
    for (const [k, v] of [
      ['line_descriptions', 'Tomate rama'], ['line_quantities', '12'], ['line_units', 'kg'],
      ['line_unit_prices', '2.45'], ['line_total_prices', '29.40'], ['line_tax_rates', '0.1'],
      ['line_descriptions', 'Merluza fresca'], ['line_quantities', '6.5'], ['line_units', 'kg'],
      ['line_unit_prices', '14.20'], ['line_total_prices', '92.30'], ['line_tax_rates', '0.1'],
    ] as Array<[string, string]>) fd.append(k, v);

    const fromForm = computeFormContentHash(header, fd, IVA_10);
    const fromStore = hashForStoredInvoice(
      {
        id: 1,
        supplier_name: header.supplierName,
        invoice_number: null,
        invoice_date: '2024-11-14',
        due_date: null,
        total_amount: '539.30',
        tax_breakdown: JSON.stringify(IVA_10),
        content_hash: 'old',
      },
      [
        { invoice_id: 1, description: 'Tomate rama', quantity: 12, unit: 'kg', unit_price: '2.45', total_price: '29.40', tax_rate: 0.1 },
        { invoice_id: 1, description: 'Merluza fresca', quantity: 6.5, unit: 'kg', unit_price: '14.20', total_price: '92.30', tax_rate: 0.1 },
      ],
    );
    expect(fromStore).toBe(fromForm);
  });

  it('survives a tax_breakdown that is not valid JSON', () => {
    expect(() => hashForStoredInvoice(
      { id: 1, supplier_name: 'X', invoice_number: null, invoice_date: null, due_date: null,
        total_amount: null, tax_breakdown: '{not json', content_hash: null },
      [],
    )).not.toThrow();
  });
});
