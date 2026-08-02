import { describe, it, expect } from 'vitest';
import { expandAbbreviations } from '../src/lib/server/products';

describe('expandAbbreviations — SKU/code stripping', () => {
	it('strips a REF.#### prefix', () => {
		expect(expandAbbreviations('REF.1042 TOMATE PERA')).toBe('TOMATE PERA');
	});
	it('strips ART / COD prefixes with separators', () => {
		expect(expandAbbreviations('ART 55-A2 Aceite')).toBe('Aceite');
		expect(expandAbbreviations('COD: X12 Sal fina')).toBe('Sal fina');
		expect(expandAbbreviations('código 900B Harina')).toBe('Harina');
	});
	it('strips a bare 4+ digit leading code', () => {
		expect(expandAbbreviations('1042 Tomate')).toBe('Tomate');
	});
	it('does NOT strip real words that merely start with ref/art', () => {
		expect(expandAbbreviations('REFRESCO cola')).toBe('REFRESCO cola');
		expect(expandAbbreviations('Artesano pan')).toBe('Artesano pan');
	});
	it('does NOT strip a 3-digit size-like leading number', () => {
		expect(expandAbbreviations('500 g azucar')).toBe('500 g azucar');
	});
});

describe('expandAbbreviations — abbreviation expansion', () => {
	it('expands the issue examples', () => {
		expect(expandAbbreviations('TERN. AGUJA')).toBe('ternera AGUJA');
		expect(expandAbbreviations('MERL. GRANDE')).toBe('merluza GRANDE');
	});
	it('expands slash abbreviations', () => {
		expect(expandAbbreviations('Solomillo S/H')).toBe('Solomillo sin hueso');
		expect(expandAbbreviations('Pollo C/P')).toBe('Pollo con piel');
	});
	it('combines SKU strip + expansion', () => {
		expect(expandAbbreviations('REF.204 TERN. PICADA')).toBe('ternera PICADA');
	});
	it('leaves ordinary words untouched', () => {
		expect(expandAbbreviations('Tomate pera roja')).toBe('Tomate pera roja');
	});
	it('returns empty for empty input and never empties a non-empty input', () => {
		expect(expandAbbreviations('')).toBe('');
		expect(expandAbbreviations('   ')).toBe('');
		// A line that is *only* a code strips to the original rather than nothing.
		expect(expandAbbreviations('REF.1042')).toBe('REF.1042');
	});
});
