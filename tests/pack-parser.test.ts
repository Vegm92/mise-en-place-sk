/**
 * Golden tests for the deterministic pack parser (issue #299, Phase 3).
 */
import { describe, it, expect } from 'vitest';
import { parsePack, normalizedUnitPrice } from '../src/lib/server/pack-parser';

describe('parsePack — multipack "N x M<unit>"', () => {
	it('parses 6x1L', () => {
		expect(parsePack('Leche entera 6x1L', 'caja')).toMatchObject({
			unitsPerPack: 6, unitSize: 1, sizeUnit: 'L', baseUnit: 'L', baseQuantity: 6,
		});
	});

	it('parses spaced and comma-decimal "12 x 330 ml"', () => {
		expect(parsePack('Refresco 12 x 330 ml')).toMatchObject({
			unitsPerPack: 12, unitSize: 330, sizeUnit: 'ml', baseUnit: 'L', baseQuantity: 12 * 0.33,
		});
	});

	it('parses "6 X 1,5 kg" with comma decimal and uppercase X', () => {
		expect(parsePack('Harina 6 X 1,5 kg')).toMatchObject({
			unitsPerPack: 6, unitSize: 1.5, sizeUnit: 'kg', baseUnit: 'kg', baseQuantity: 9,
		});
	});
});

describe('parsePack — single size', () => {
	it('parses "Garrafa 5L"', () => {
		expect(parsePack('Aceite de girasol Garrafa 5L', 'garrafa')).toMatchObject({
			unitsPerPack: 1, unitSize: 5, sizeUnit: 'L', baseUnit: 'L', baseQuantity: 5,
		});
	});

	it('parses grams into a kg base', () => {
		expect(parsePack('Café molido 250 g')).toMatchObject({ sizeUnit: 'g', baseUnit: 'kg', baseQuantity: 0.25 });
	});

	it('parses centiliters into a L base', () => {
		expect(parsePack('Vino tinto 75cl', 'botella')).toMatchObject({ sizeUnit: 'cl', baseUnit: 'L', baseQuantity: 0.75 });
	});

	it('falls back to the unit column when the description has no size', () => {
		expect(parsePack('Aceite oliva', 'garrafa 5 l')).toMatchObject({ baseUnit: 'L', baseQuantity: 5 });
	});
});

describe('parsePack — count of pieces', () => {
	it('parses "caja 12 ud" as 12 units via the single-size path', () => {
		expect(parsePack('Yogur natural caja 12 ud')).toMatchObject({ sizeUnit: 'ud', baseUnit: 'ud', baseQuantity: 12 });
	});

	it('parses "estuche de 24" via the count path', () => {
		expect(parsePack('Chicle estuche de 24')).toMatchObject({ unitsPerPack: 24, sizeUnit: 'ud', baseUnit: 'ud', baseQuantity: 24 });
	});
});

describe('parsePack — no size found', () => {
	it('returns null for a bare container with no number', () => {
		expect(parsePack('Tomate pera', 'caja')).toBeNull();
	});

	it('does not treat a non-unit word as a size', () => {
		expect(parsePack('Agua 8 estrellas')).toBeNull();
	});

	it('returns null for empty input', () => {
		expect(parsePack('', null)).toBeNull();
		expect(parsePack(null, undefined)).toBeNull();
	});
});

describe('normalizedUnitPrice', () => {
	it('divides the unit price by the base content', () => {
		const pack = parsePack('Garrafa 5L', 'garrafa');
		expect(normalizedUnitPrice(12.5, pack)).toBe(2.5); // €/L
	});

	it('makes different pack sizes of the same product comparable', () => {
		// The motivating case from #299: caja 5kg @ 12,50 vs caja 10kg @ 24,00.
		const small = normalizedUnitPrice(12.5, parsePack('Harina caja 5kg'));
		const big = normalizedUnitPrice(24.0, parsePack('Harina caja 10kg'));
		expect(small).toBe(2.5);
		expect(big).toBe(2.4);
		// ~4% apart on €/kg, not the 92% a per-caja comparison would show.
		expect(Math.abs((big! - small!) / small!)).toBeLessThan(0.05);
	});

	it('returns null when price or pack is missing', () => {
		expect(normalizedUnitPrice(null, parsePack('Garrafa 5L'))).toBeNull();
		expect(normalizedUnitPrice(10, null)).toBeNull();
	});
});
