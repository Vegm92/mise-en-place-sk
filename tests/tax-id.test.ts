/**
 * Spanish tax-id normalisation and validation (issue #905).
 *
 * The restaurant's own CIF/NIF is the key the backend will use to tell the
 * emisor from the receptor on a scanned document, so a typo has to be caught
 * where a human types it — in Settings — rather than silently poisoning every
 * later match. That is why validation here is a real checksum (DNI/NIE mod 23,
 * CIF control character) and not a shape regex.
 *
 * Normalisation is deliberately separate from validation: extracted supplier
 * ids (task 3 of the issue) must be normalised for comparison even when they
 * are foreign VAT numbers that no Spanish checksum accepts.
 */
import { describe, it, expect } from 'vitest';
import { normalizeTaxId, isValidSpanishTaxId, taxIdDecidesIdentity, MIN_TAX_ID_MATCH_CONFIDENCE } from '../src/lib/tax-id';

describe('normalizeTaxId', () => {
	it('uppercases and strips separators', () => {
		expect(normalizeTaxId(' b-99.999.999 ')).toBe('B99999999');
		expect(normalizeTaxId('47306879-l')).toBe('47306879L');
	});

	it('strips the ES country prefix only when what remains is a full tax id', () => {
		expect(normalizeTaxId('ESB99999999')).toBe('B99999999');
		expect(normalizeTaxId('ESPARTO SL')).toBe('ESPARTOSL');
	});

	it('returns null for empty input', () => {
		expect(normalizeTaxId('')).toBeNull();
		expect(normalizeTaxId('   ')).toBeNull();
		expect(normalizeTaxId(null)).toBeNull();
		expect(normalizeTaxId(undefined)).toBeNull();
	});
});

describe('isValidSpanishTaxId', () => {
	it('accepts a DNI with the right control letter', () => {
		expect(isValidSpanishTaxId('47306879L')).toBe(true);
		expect(isValidSpanishTaxId('12345678Z')).toBe(true);
	});

	it('accepts an NIE for each prefix letter', () => {
		expect(isValidSpanishTaxId('X1234567L')).toBe(true);
		expect(isValidSpanishTaxId('Y1234567X')).toBe(true);
		expect(isValidSpanishTaxId('Z1234567R')).toBe(true);
	});

	it('accepts a CIF whose control is a digit and one whose control is a letter', () => {
		expect(isValidSpanishTaxId('B99999997')).toBe(true);
		expect(isValidSpanishTaxId('P1234567D')).toBe(true);
	});

	it('rejects a wrong control character', () => {
		expect(isValidSpanishTaxId('47306879M')).toBe(false);
		expect(isValidSpanishTaxId('X1234567M')).toBe(false);
		expect(isValidSpanishTaxId('B99999998')).toBe(false);
	});

	it('rejects the control kind the entity type does not allow', () => {
		expect(isValidSpanishTaxId('P12345674')).toBe(false);
		expect(isValidSpanishTaxId('B9999999G')).toBe(false);
	});

	it('rejects junk, wrong lengths and unknown entity letters', () => {
		expect(isValidSpanishTaxId('')).toBe(false);
		expect(isValidSpanishTaxId('B-99881122')).toBe(false);
		expect(isValidSpanishTaxId('1234567Z')).toBe(false);
		expect(isValidSpanishTaxId('I99999999')).toBe(false);
	});
});

describe('taxIdDecidesIdentity', () => {
	it('accepts a checksum-valid id the model read clearly', () => {
		expect(taxIdDecidesIdentity('B99999997', 0.99)).toBe(true);
		expect(taxIdDecidesIdentity('b-99.999.997', MIN_TAX_ID_MATCH_CONFIDENCE)).toBe(true);
	});

	it('refuses an id no Spanish checksum accepts', () => {
		expect(taxIdDecidesIdentity('B99999998', 1)).toBe(false);
		expect(taxIdDecidesIdentity('FR12345678901', 1)).toBe(false);
		expect(taxIdDecidesIdentity(null, 1)).toBe(false);
	});

	it('refuses a valid id the model says it could not read', () => {
		expect(taxIdDecidesIdentity('B99999997', 0.84)).toBe(false);
		expect(taxIdDecidesIdentity('B99999997', 0)).toBe(false);
	});

	it('treats a missing or unusable score as no evidence against the reading', () => {
		expect(taxIdDecidesIdentity('B99999997')).toBe(true);
		expect(taxIdDecidesIdentity('B99999997', null)).toBe(true);
		expect(taxIdDecidesIdentity('B99999997', Number.NaN)).toBe(true);
	});
});
