import { describe, it, expect } from 'vitest';
import {
  percentToFraction,
  fractionToPercent,
  percentInputValue,
  bandAmountCents,
  bandsFromInputs,
  sumTaxCents,
  taxableBaseCents,
  taxableBaseMoney,
  lineRateFractions,
  bandsFromLines,
  detectTotalMismatch,
} from '../src/lib/tax';
import { resolveTaxBreakdown, resolveTotalsBreakdown } from '../src/lib/server/invoice-save';

describe('percentToFraction (the UI always speaks percent)', () => {
  it('reads a plain percentage', () => {
    expect(percentToFraction('21')).toBe(0.21);
    expect(percentToFraction('10')).toBe(0.1);
    expect(percentToFraction('4')).toBe(0.04);
  });

  it('accepts a comma decimal, as Spanish keyboards produce', () => {
    expect(percentToFraction('1,4')).toBe(0.014);
    expect(percentToFraction('5,2')).toBe(0.052);
    expect(percentToFraction('0,5')).toBe(0.005);
  });

  it('reads the same value written with a dot', () => {
    expect(percentToFraction('1.4')).toBe(0.014);
  });

  it('is unambiguous: the input is always a percentage, never a fraction', () => {
    expect(percentToFraction('0.21')).toBe(0.0021);
  });

  it('tolerates the per-cent sign a reviewer types into a % field', () => {
    expect(percentToFraction('21%')).toBe(0.21);
    expect(percentToFraction('1,4 %')).toBe(0.014);
  });

  it('keeps a genuine zero rate distinct from no rate at all', () => {
    expect(percentToFraction('0')).toBe(0);
    expect(percentToFraction('')).toBeNull();
  });

  it('rejects blanks and junk rather than guessing', () => {
    expect(percentToFraction('')).toBeNull();
    expect(percentToFraction('  ')).toBeNull();
    expect(percentToFraction('n/a')).toBeNull();
    expect(percentToFraction('%')).toBeNull();
    expect(percentToFraction('-5')).toBeNull();
    expect(percentToFraction('1e2')).toBeNull();
    expect(percentToFraction(null)).toBeNull();
    expect(percentToFraction(undefined)).toBeNull();
  });
});

describe('fractionToPercent (stored rates are fractions)', () => {
  it('converts the fraction the extractor and both e-invoice parsers emit', () => {
    expect(fractionToPercent(0.21)).toBe(21);
    expect(fractionToPercent(0.014)).toBe(1.4);
    expect(fractionToPercent(0.052)).toBe(5.2);
  });

  it('treats 1 as 100%, not as an already-percent value', () => {
    expect(fractionToPercent(1)).toBe(100);
  });

  it('passes through a value above 1 as an already-percent figure', () => {
    expect(fractionToPercent(21)).toBe(21);
  });

  it('round-trips through percentToFraction', () => {
    for (const rate of [0.21, 0.1, 0.04, 0.014, 0.052, 0.005]) {
      expect(percentToFraction(percentInputValue(rate))).toBe(rate);
    }
  });

  it('renders an empty input for a missing rate', () => {
    expect(percentInputValue(null)).toBe('');
    expect(percentInputValue(undefined)).toBe('');
    expect(percentInputValue('')).toBe('');
  });
});

describe('bandAmountCents', () => {
  it('computes the cuota from base and rate', () => {
    expect(bandAmountCents('739.85', '10')).toBe(7399);
    expect(bandAmountCents('739.85', '1,4')).toBe(1036);
    expect(bandAmountCents('100.00', '21')).toBe(2100);
  });

  it('returns null when either side is unusable', () => {
    expect(bandAmountCents('', '21')).toBeNull();
    expect(bandAmountCents('100.00', '')).toBeNull();
  });
});

describe('bandsFromInputs', () => {
  it('builds the stored shape, with rates back as fractions', () => {
    expect(bandsFromInputs([
      { rate: '10', type: 'iva', base: '739.85', amount: '73.98' },
      { rate: '1,4', type: 'rec', base: '739.85', amount: '10.36' },
    ])).toEqual([
      { rate: 0.1, type: 'iva', base: 739.85, tax_amount: 73.98 },
      { rate: 0.014, type: 'rec', base: 739.85, tax_amount: 10.36 },
    ]);
  });

  it('omits type when the reviewer left it unspecified', () => {
    const [band] = bandsFromInputs([{ rate: '21', type: '', base: '100.00', amount: '21.00' }]);
    expect(band).toEqual({ rate: 0.21, base: 100, tax_amount: 21 });
    expect('type' in band).toBe(false);
  });

  it('ignores an unrecognised type rather than storing it', () => {
    const [band] = bandsFromInputs([{ rate: '21', type: 'irpf', base: '100.00', amount: '21.00' }]);
    expect('type' in band).toBe(false);
  });

  it('drops rows the reviewer left entirely blank', () => {
    expect(bandsFromInputs([{ rate: '', type: '', base: '', amount: '' }])).toEqual([]);
  });

  it('keeps a row that carries an amount but no rate', () => {
    expect(bandsFromInputs([{ rate: '', type: '', base: '', amount: '12.00' }]))
      .toEqual([{ rate: 0, base: 0, tax_amount: 12 }]);
  });
});

describe('taxableBaseCents (IVA and REC ride on the same base)', () => {
  it('does not double-count a base carrying both IVA and REC', () => {
    const bands = bandsFromInputs([
      { rate: '10', type: 'iva', base: '739.85', amount: '73.98' },
      { rate: '1,4', type: 'rec', base: '739.85', amount: '10.36' },
    ]);
    expect(taxableBaseCents(bands)).toBe(73985);
    expect(taxableBaseMoney(bands)).toBe('739.85');
  });

  it('sums several rates of the same type, as a mixed-rate invoice needs', () => {
    const bands = bandsFromInputs([
      { rate: '10', type: 'iva', base: '400.00', amount: '40.00' },
      { rate: '21', type: 'iva', base: '100.00', amount: '21.00' },
      { rate: '4', type: 'iva', base: '50.00', amount: '2.00' },
    ]);
    expect(taxableBaseCents(bands)).toBe(55000);
  });

  it('folds an untyped band into the IVA base instead of standing it up as its own', () => {
    const bands = bandsFromInputs([
      { rate: '21', type: 'iva', base: '100.00', amount: '21.00' },
      { rate: '10', type: '', base: '50.00', amount: '5.00' },
    ]);
    expect(taxableBaseCents(bands)).toBe(15000);
  });

  it('still holds REC apart when it rides alongside an untyped band', () => {
    const bands = bandsFromInputs([
      { rate: '10', type: '', base: '739.85', amount: '73.98' },
      { rate: '1,4', type: 'rec', base: '739.85', amount: '10.36' },
    ]);
    expect(taxableBaseCents(bands)).toBe(73985);
  });

  it('sums untyped bands together', () => {
    const bands = bandsFromInputs([
      { rate: '10', type: '', base: '400.00', amount: '40.00' },
      { rate: '21', type: '', base: '100.00', amount: '21.00' },
    ]);
    expect(taxableBaseCents(bands)).toBe(50000);
  });

  it('is zero for no bands', () => {
    expect(taxableBaseCents([])).toBe(0);
  });

  it('totals the cuotas across every band', () => {
    const bands = bandsFromInputs([
      { rate: '10', type: 'iva', base: '739.85', amount: '73.98' },
      { rate: '1,4', type: 'rec', base: '739.85', amount: '10.36' },
    ]);
    expect(sumTaxCents(bands)).toBe(8434);
  });
});

describe('bandsFromLines (different products, different rates)', () => {
  const lines = [
    { totalPrice: '100.00', rate: '10' },
    { totalPrice: '50.00', rate: '10' },
    { totalPrice: '30.00', rate: '21' },
    { totalPrice: '20.00', rate: '' },
  ];

  it('reports each distinct rate the lines carry, highest first', () => {
    expect(lineRateFractions(lines)).toEqual([0.21, 0.1]);
  });

  it('groups the lines into one band per rate', () => {
    expect(bandsFromLines(lines, 'iva')).toEqual([
      { rate: 0.21, type: 'iva', base: 30, tax_amount: 6.3 },
      { rate: 0.1, type: 'iva', base: 150, tax_amount: 15 },
    ]);
  });

  it('leaves untaxed lines out of every band', () => {
    const total = bandsFromLines(lines).reduce((s, b) => s + b.base, 0);
    expect(total).toBe(180);
  });

  it('omits type when none is given', () => {
    const [band] = bandsFromLines([{ totalPrice: '100.00', rate: '21' }]);
    expect('type' in band).toBe(false);
  });

  it('returns nothing when no line carries a rate', () => {
    expect(bandsFromLines([{ totalPrice: '100.00', rate: null }])).toEqual([]);
    expect(lineRateFractions([{ totalPrice: '100.00', rate: null }])).toEqual([]);
  });
});

describe('detectTotalMismatch (issue #808 — the reconciliation check itself)', () => {
  it('passes when the lines plus tax bands add up to the total', () => {
    const bands = bandsFromInputs([{ rate: '10', type: 'iva', base: '100.00', amount: '10.00' }]);
    expect(detectTotalMismatch(['100.00'], bands, '110.00')).toBe(false);
  });

  it('flags a line sum that does not reconcile with the total, with no tax involved', () => {
    expect(detectTotalMismatch(['80.00', '10.00'], null, '100.00')).toBe(true);
  });

  it('flags a mismatch even when tax bands are present but do not close the gap', () => {
    const bands = bandsFromInputs([{ rate: '21', type: 'iva', base: '100.00', amount: '21.00' }]);
    expect(detectTotalMismatch(['90.00'], bands, '121.00')).toBe(true);
  });

  it('tolerates a 1-cent rounding difference', () => {
    expect(detectTotalMismatch(['33.33', '33.33', '33.34'], null, '100.00')).toBe(false);
    expect(detectTotalMismatch(['33.33', '33.33', '33.33'], null, '100.00')).toBe(false);
  });

  it('flags a gap bigger than the rounding tolerance', () => {
    expect(detectTotalMismatch(['33.33', '33.33', '33.33'], null, '100.05')).toBe(true);
  });

  it('never flags when there is no usable total to compare against', () => {
    expect(detectTotalMismatch(['80.00'], null, null)).toBe(false);
    expect(detectTotalMismatch(['80.00'], null, '0')).toBe(false);
    expect(detectTotalMismatch(['80.00'], null, '-10.00')).toBe(false);
  });

  it('treats a missing line total as zero rather than throwing', () => {
    expect(detectTotalMismatch([null, '50.00'], null, '50.00')).toBe(false);
  });

  it('does not flag a correct IRPF retention invoice (issue #916)', () => {
    const bands = bandsFromInputs([{ rate: '21', type: 'iva', base: '1000.00', amount: '210.00' }]);
    expect(detectTotalMismatch(['1000.00'], bands, '1060.00', { retentionAmount: '150.00' })).toBe(false);
  });

  it('still flags a genuine mismatch once retention is accounted for (issue #916)', () => {
    const bands = bandsFromInputs([{ rate: '21', type: 'iva', base: '1000.00', amount: '210.00' }]);
    expect(detectTotalMismatch(['1000.00'], bands, '1000.00', { retentionAmount: '150.00' })).toBe(true);
  });

  it('does not flag a correct global-discount invoice (issue #916)', () => {
    const bands = bandsFromInputs([{ rate: '21', type: 'iva', base: '95.00', amount: '19.95' }]);
    expect(detectTotalMismatch(['100.00'], bands, '114.95', { discountAmount: '5.00' })).toBe(false);
  });

  it('reconciles a discount and a retention together (issue #916)', () => {
    const bands = bandsFromInputs([{ rate: '21', type: 'iva', base: '950.00', amount: '199.50' }]);
    expect(detectTotalMismatch(
      ['1000.00'], bands, '1006.75', { discountAmount: '50.00', retentionAmount: '142.75' },
    )).toBe(false);
  });
});

describe('resolveTaxBreakdown (the form is authoritative once it posts bands)', () => {
  const extracted = {
    tax_base: 500,
    tax_breakdown: [{ rate: 0.21, base: 500, tax_amount: 105, type: 'iva' }],
  };

  function form(entries: Array<[string, string]>): FormData {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  }

  it('uses the reviewer-corrected bands over the extraction', () => {
    const fd = form([
      ['tax_bands_present', '1'],
      ['tax_rates', '10'], ['tax_types', 'iva'], ['tax_bases', '739.85'], ['tax_amounts', '73.98'],
      ['tax_rates', '1,4'], ['tax_types', 'rec'], ['tax_bases', '739.85'], ['tax_amounts', '10.36'],
    ]);
    const { taxBase, taxBreakdown } = resolveTaxBreakdown(fd, extracted);
    expect(taxBase).toBe('739.85');
    expect(JSON.parse(taxBreakdown!)).toEqual([
      { rate: 0.1, type: 'iva', base: 739.85, tax_amount: 73.98 },
      { rate: 0.014, type: 'rec', base: 739.85, tax_amount: 10.36 },
    ]);
  });

  it('lets the reviewer clear the breakdown entirely', () => {
    const fd = form([['tax_bands_present', '1']]);
    expect(resolveTaxBreakdown(fd, extracted)).toEqual({ taxBase: null, taxBreakdown: null, bands: null });
  });

  it('keeps an extracted tax_base when the extraction never carried bands to clear', () => {
    const noBands = { tax_base: 500, tax_breakdown: null };
    const fd = form([['tax_bands_present', '1']]);
    expect(resolveTaxBreakdown(fd, noBands)).toEqual({
      taxBase: '500.00', taxBreakdown: null, bands: null,
    });
  });

  it('falls back to the extraction when the form carries no tax fields', () => {
    const { taxBase, taxBreakdown } = resolveTaxBreakdown(form([]), extracted);
    expect(taxBase).toBe('500.00');
    expect(JSON.parse(taxBreakdown!)).toEqual(extracted.tax_breakdown);
  });

  it('yields nulls when there is neither a form nor an extraction', () => {
    expect(resolveTaxBreakdown(form([]), undefined)).toEqual({ taxBase: null, taxBreakdown: null, bands: null });
  });
});

describe('resolveTotalsBreakdown (gross/discount/retention, issue #916)', () => {
  function form(entries: Array<[string, string]>): FormData {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  }

  it('reads gross, discount and retention straight from the extraction', () => {
    const extracted = {
      gross_amount: 1000, discount_amount: 50, retention_rate: 0.15, retention_amount: 142.5,
    };
    expect(resolveTotalsBreakdown(form([]), extracted)).toEqual({
      grossAmount: '1000.00', discountAmount: '50.00', retentionRate: 0.15, retentionAmount: '142.50',
    });
  });

  it('yields nulls when the extraction carries none of these fields', () => {
    expect(resolveTotalsBreakdown(form([]), { tax_base: 500 })).toEqual({
      grossAmount: null, discountAmount: null, retentionRate: null, retentionAmount: null,
    });
  });

  it('yields nulls when there is no extraction at all', () => {
    expect(resolveTotalsBreakdown(form([]), undefined)).toEqual({
      grossAmount: null, discountAmount: null, retentionRate: null, retentionAmount: null,
    });
  });

  it('prefers a reviewer-submitted correction over the extraction (issue #916 review fix)', () => {
    const extracted = {
      gross_amount: 1000, discount_amount: 50, retention_rate: 0.15, retention_amount: 142.5,
    };
    const fd = form([
      ['discount_amount', '75.00'],
      ['retention_rate', '0.19'],
      ['retention_amount', '190.00'],
    ]);
    expect(resolveTotalsBreakdown(fd, extracted)).toEqual({
      grossAmount: '1000.00', discountAmount: '75.00', retentionRate: 0.19, retentionAmount: '190.00',
    });
  });

  it('lets a reviewer enter these fields for a manually-entered invoice with no extraction at all', () => {
    const fd = form([
      ['discount_amount', '10.00'],
      ['retention_rate', '0.07'],
      ['retention_amount', '20.00'],
    ]);
    expect(resolveTotalsBreakdown(fd, undefined)).toEqual({
      grossAmount: null, discountAmount: '10.00', retentionRate: 0.07, retentionAmount: '20.00',
    });
  });
});
