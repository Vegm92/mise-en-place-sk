/**
 * Golden tests for the shared product/unit normalization (issue #296).
 *
 * normalizeProductKey MUST behave identically to the SQL function
 * mep_norm_key (drizzle/0018_product_key_normalization.sql) for Spanish
 * invoice text — if you change one, change both and extend these cases.
 */
import { describe, it, expect } from 'vitest';
import {
	normalizeProductKey, canonicalizeUnit, normalizeSupplierName, isSameSupplierName,
} from '../src/lib/server/normalize';

describe('normalizeProductKey', () => {
	it('is case-insensitive', () => {
		expect(normalizeProductKey('TOMATE PERA')).toBe('tomate pera');
		expect(normalizeProductKey('Tomate Pera')).toBe('tomate pera');
	});

	it('folds Spanish accents and ñ', () => {
		expect(normalizeProductKey('Azúcar')).toBe('azucar');
		expect(normalizeProductKey('Jamón Ibérico')).toBe('jamon iberico');
		expect(normalizeProductKey('Ñora seca')).toBe('nora seca');
	});

	it('collapses and trims whitespace', () => {
		expect(normalizeProductKey('  Aceite   de  oliva ')).toBe('aceite de oliva');
		expect(normalizeProductKey('Queso\tManchego')).toBe('queso manchego');
	});

	it('makes real-world supplier reprints converge on one key', () => {
		const variants = ['TOMATE PERA 5KG', 'Tomate Pera 5Kg', ' tomate  pera 5kg '];
		const keys = new Set(variants.map(normalizeProductKey));
		expect(keys.size).toBe(1);
	});

	it('returns empty string for whitespace-only input', () => {
		expect(normalizeProductKey('   ')).toBe('');
	});
});

describe('canonicalizeUnit', () => {
	it('accepts canonical spellings as-is', () => {
		expect(canonicalizeUnit('kg')).toBe('kg');
		expect(canonicalizeUnit('ud')).toBe('ud');
		expect(canonicalizeUnit('caja')).toBe('caja');
	});

	it('folds casing, plurals and Spanish long forms', () => {
		expect(canonicalizeUnit('Kg')).toBe('kg');
		expect(canonicalizeUnit('KILOS')).toBe('kg');
		expect(canonicalizeUnit('kilogramos')).toBe('kg');
		expect(canonicalizeUnit('grs')).toBe('g');
		expect(canonicalizeUnit('Lts')).toBe('L');
		expect(canonicalizeUnit('litros')).toBe('L');
		expect(canonicalizeUnit('Unidades')).toBe('ud');
		expect(canonicalizeUnit('u')).toBe('ud');
		expect(canonicalizeUnit('CAJAS')).toBe('caja');
		expect(canonicalizeUnit('garrafas')).toBe('garrafa');
		expect(canonicalizeUnit('docenas')).toBe('docena');
		expect(canonicalizeUnit('sacos')).toBe('saco');
	});

	it('strips trailing dots from abbreviations', () => {
		expect(canonicalizeUnit('ud.')).toBe('ud');
		expect(canonicalizeUnit('Kg.')).toBe('kg');
	});

	it('maps UN/ECE Rec 20/21 codes (UBL unitCode)', () => {
		expect(canonicalizeUnit('KGM')).toBe('kg');
		expect(canonicalizeUnit('GRM')).toBe('g');
		expect(canonicalizeUnit('LTR')).toBe('L');
		expect(canonicalizeUnit('MLT')).toBe('ml');
		expect(canonicalizeUnit('C62')).toBe('ud');
		expect(canonicalizeUnit('EA')).toBe('ud');
		expect(canonicalizeUnit('DZN')).toBe('docena');
		expect(canonicalizeUnit('XBX')).toBe('caja');
		expect(canonicalizeUnit('XBG')).toBe('bolsa');
		expect(canonicalizeUnit('BTL')).toBe('botella');
	});

	it('returns null for unknown or size-bearing units (need a conversion rule)', () => {
		expect(canonicalizeUnit('wedge')).toBeNull();
		expect(canonicalizeUnit('media caja')).toBeNull();
		expect(canonicalizeUnit('garrafa 5L')).toBeNull();
		expect(canonicalizeUnit('ZZ9')).toBeNull();
	});

	it('returns null for empty input', () => {
		expect(canonicalizeUnit('')).toBeNull();
		expect(canonicalizeUnit(null)).toBeNull();
		expect(canonicalizeUnit(undefined)).toBeNull();
	});
});

describe('normalizeSupplierName', () => {
	it('is case-insensitive and folds accents', () => {
		expect(normalizeSupplierName('LÁCTEOS GARCÍA')).toBe(normalizeSupplierName('lacteos garcia'));
	});

	it('strips a trailing Spanish legal form', () => {
		expect(normalizeSupplierName('Suministros Alimentarios Goya, S.L.')).toBe('suministros alimentarios goya');
		expect(normalizeSupplierName('Suministros Alimentarios Goya S.L.U.')).toBe('suministros alimentarios goya');
		expect(normalizeSupplierName('Suministros Alimentarios Goya, S.A.')).toBe('suministros alimentarios goya');
		expect(normalizeSupplierName('Distribuciones Norte Coop.')).toBe('distribuciones norte');
		expect(normalizeSupplierName('Distribuciones Norte S. Coop.')).toBe('distribuciones norte');
	});

	it('converges a bare name and its legal-form variant on the same key', () => {
		expect(normalizeSupplierName('Suministros Alimentarios Goya'))
			.toBe(normalizeSupplierName('Suministros Alimentarios Goya, S.L.'));
	});

	it('collapses whitespace and punctuation noise', () => {
		expect(normalizeSupplierName('  Suministros   Alimentarios,  Goya  S.L.  '))
			.toBe('suministros alimentarios goya');
	});

	it('still distinguishes genuinely different businesses', () => {
		expect(normalizeSupplierName('Lácteos García, S.L.'))
			.not.toBe(normalizeSupplierName('García Bebidas, S.L.'));
	});

	it('returns empty string for whitespace-only or legal-form-only input', () => {
		expect(normalizeSupplierName('   ')).toBe('');
		expect(normalizeSupplierName('S.L.')).toBe('');
	});

	it('collapses the base name even when the two sides declare different explicit legal forms', () => {
		// normalizeSupplierName alone only strips the suffix — it is not the
		// match decision. isSameSupplierName below is what must tell these apart.
		expect(normalizeSupplierName('Distribuciones Ruiz S.L.')).toBe('distribuciones ruiz');
		expect(normalizeSupplierName('Distribuciones Ruiz S.A.')).toBe('distribuciones ruiz');
	});
});

describe('isSameSupplierName', () => {
	it('matches an unedited name against itself', () => {
		expect(isSameSupplierName('Suministros Alimentarios Goya', 'Suministros Alimentarios Goya')).toBe(true);
	});

	it('matches when a legal form is added to a name that had none (the #384 case)', () => {
		expect(isSameSupplierName('Suministros Alimentarios Goya', 'Suministros Alimentarios Goya, S.L.')).toBe(true);
	});

	it('matches through case, accent and punctuation noise', () => {
		expect(isSameSupplierName('LÁCTEOS GARCÍA', '  lacteos,  garcia  ')).toBe(true);
	});

	it('does NOT match two names that both declare an explicit, different legal form', () => {
		// Same base name, but "S.L." and "S.A." are different real legal
		// entities (sibling companies, or unrelated firms sharing a trade
		// name) — that must not be read as "the same supplier, just retyped".
		expect(isSameSupplierName('Distribuciones Ruiz S.L.', 'Distribuciones Ruiz S.A.')).toBe(false);
		expect(isSameSupplierName('Distribuciones Ruiz, S.L.U.', 'Distribuciones Ruiz, S.L.')).toBe(false);
	});

	it('matches when both sides declare the same explicit legal form', () => {
		expect(isSameSupplierName('Distribuciones Ruiz S.L.', 'Distribuciones Ruiz, S.L.')).toBe(true);
	});

	it('does not match genuinely different businesses regardless of legal form', () => {
		expect(isSameSupplierName('Lácteos García, S.L.', 'García Bebidas, S.L.')).toBe(false);
	});

	it('does not match two blank/legal-form-only names', () => {
		expect(isSameSupplierName('S.L.', 'S.A.')).toBe(false);
		expect(isSameSupplierName('   ', '   ')).toBe(false);
	});
});
