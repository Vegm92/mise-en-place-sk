/**
 * Golden tests for the shared product/unit normalization (issue #296).
 *
 * normalizeProductKey MUST behave identically to the SQL function
 * mep_norm_key (drizzle/0018_product_key_normalization.sql) for Spanish
 * invoice text — if you change one, change both and extend these cases.
 */
import { describe, it, expect } from 'vitest';
import {
	normalizeProductKey, canonicalizeUnit, normalizeSupplierName, isSameSupplierName, parseSupplierName,
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

	it('strips a whole run of trailing dots, and nothing else', () => {
		// The trailing-dot strip is anchored at the end of the key: a run of
		// dots goes, dots elsewhere stay (and a dots-only unit is not a unit).
		expect(canonicalizeUnit('kg...')).toBe('kg');
		expect(canonicalizeUnit('ud ..')).toBeNull();
		expect(canonicalizeUnit('...')).toBeNull();
	});

	it('does not blow up on a long trailing-dot run (regex backtracking DoS)', () => {
		// unit text arrives from Gemini extraction and from supplier XML, so
		// the strip must stay linear in the length of the dot run.
		const start = performance.now();
		expect(canonicalizeUnit(`kg${'.'.repeat(120000)}x`)).toBeNull();
		expect(canonicalizeUnit(`kg${'.'.repeat(120000)}`)).toBe('kg');
		expect(performance.now() - start).toBeLessThan(500);
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

	it('recognises every legal form in the table, and reports it in compact form', () => {
		// parseSupplierName's legal-form pattern is assembled from a token
		// table; these cases pin one alternative each so a table edit that
		// changes the generated pattern fails loudly.
		const cases: Array<[string, string]> = [
			['Goya S.L.U.',   'slu'],
			['Goya S.L.N.E.', 'slne'],
			['Goya S.A.U.',   'sau'],
			['Goya S.C.P.',   'scp'],
			['Goya S. Coop.', 'scoop'],
			['Goya Coop.',    'coop'],
			['Goya S.L.',     'sl'],
			['Goya S.A.',     'sa'],
			['Goya S.C.',     'sc'],
			['Goya C.B.',     'cb'],
		];
		for (const [raw, legalForm] of cases) {
			expect(parseSupplierName(raw)).toEqual({ base: 'goya', legalForm });
		}
	});

	it('reads the legal form the same way however the separator is spelled', () => {
		// Whitespace is collapsed before the pattern runs, so runs of spaces,
		// tabs and a comma separator all reach it as a single space.
		expect(parseSupplierName('Goya   S.  L.')).toEqual({ base: 'goya', legalForm: 'sl' });
		expect(parseSupplierName('Goya,S.L.')).toEqual({ base: 'goya', legalForm: 'sl' });
		expect(parseSupplierName('Goya\t\tS L')).toEqual({ base: 'goya', legalForm: 'sl' });
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

	it('does not strip a legal-form bigram/trigram that is part of an ordinary word, not a separate suffix', () => {
		// "Casa" and "Rosa" both end in a two-letter run ("sa") that also
		// happens to spell a legal form (S.A.) — but with no separator
		// (comma/whitespace/start-of-string) immediately before it, it is
		// just the tail of an ordinary word and must be left alone.
		expect(parseSupplierName('La Casa')).toEqual({ base: 'la casa', legalForm: null });
		expect(parseSupplierName('Casa Rosa')).toEqual({ base: 'casa rosa', legalForm: null });
		expect(parseSupplierName('Brasa')).toEqual({ base: 'brasa', legalForm: null });
		expect(parseSupplierName('Prensa')).toEqual({ base: 'prensa', legalForm: null });
		expect(parseSupplierName('Mercat Fresc')).toEqual({ base: 'mercat fresc', legalForm: null });
		expect(parseSupplierName('Formatgeria Rosc')).toEqual({ base: 'formatgeria rosc', legalForm: null });
	});

	it('still strips the real legal form once it is properly separated from those same words', () => {
		expect(normalizeSupplierName('La Casa, S.L.')).toBe('la casa');
		expect(normalizeSupplierName('Casa Rosa, S.L.')).toBe('casa rosa');
	});

	it('does not blow up on a long internal whitespace run (regex backtracking DoS)', () => {
		// supplier_name reaches parseSupplierName straight from unvalidated
		// form data on the invoice-save request path — an uncollapsed \s+/\s*
		// run in the legal-form regex previously caused catastrophic
		// backtracking (tens of seconds) on input like this.
		const padded = 'AAAA' + ' '.repeat(128000) + 'ZZZZ';
		const start = performance.now();
		parseSupplierName(padded);
		expect(performance.now() - start).toBeLessThan(500);
	});
});

describe('isSameSupplierName', () => {
	it('matches an unedited name against itself', () => {
		expect(isSameSupplierName('Suministros Alimentarios Goya', 'Suministros Alimentarios Goya')).toBe(true);
	});

	it('matches when a legal form is added to a name that had none (the #384 case)', () => {
		expect(isSameSupplierName('Suministros Alimentarios Goya', 'Suministros Alimentarios Goya, S.L.')).toBe(true);
	});

	it('still matches for ordinary names ending in a legal-form bigram, once a real legal form is added', () => {
		expect(isSameSupplierName('La Casa', 'La Casa, S.L.')).toBe(true);
		expect(isSameSupplierName('Casa Rosa', 'Casa Rosa, S.L.')).toBe(true);
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
