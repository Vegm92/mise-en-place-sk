/**
 * Deterministic pack/format parser (issue #299, Phase 3).
 *
 * Extracts pack structure from the free-text description (and, as a fallback,
 * the unit column) of an invoice line — "6x1L", "Garrafa 5L", "caja 12 ud",
 * "500 g", "botella 75 cl" — so a €/kg-L-ud price can be derived and compared
 * across different pack sizes. Container units carry no intrinsic size, so a
 * bare "caja" with no number anywhere yields null (→ no normalized price).
 *
 * Pure module — no DB imports, safe for the worker and for unit tests.
 */
import { canonicalizeUnit } from './normalize';

export type BaseUnit = 'kg' | 'L' | 'ud';

export interface PackInfo {
	/** Number of sub-units in the purchase unit ("6" in "6x1L"; 1 otherwise). */
	unitsPerPack: number;
	/** Size of one sub-unit as printed ("1" in "6x1L", "5" in "Garrafa 5L"). */
	unitSize: number;
	/** Canonical size token: kg | g | mg | L | ml | cl | ud | docena. */
	sizeUnit: string;
	/** Total content per purchase unit, expressed in baseUnit (kg / L / ud). */
	baseQuantity: number;
	/** Dimension base used for €-normalization. */
	baseUnit: BaseUnit;
}

// Canonical size token → base dimension unit + multiplier to that base.
const SIZE_TO_BASE: Record<string, { base: BaseUnit; factor: number }> = {
	kg:     { base: 'kg', factor: 1 },
	g:      { base: 'kg', factor: 0.001 },
	mg:     { base: 'kg', factor: 0.000001 },
	L:      { base: 'L',  factor: 1 },
	ml:     { base: 'L',  factor: 0.001 },
	cl:     { base: 'L',  factor: 0.01 },
	ud:     { base: 'ud', factor: 1 },
	docena: { base: 'ud', factor: 12 },
};

/** Map any spelling of a size token to a canonical one backed by a base dim. */
function sizeToken(raw: string): string | null {
	const canonical = canonicalizeUnit(raw);
	if (canonical && SIZE_TO_BASE[canonical]) return canonical;
	return null;
}

function num(raw: string): number {
	// Spanish decimals use a comma; strip thousands dots only when followed by
	// exactly 3 digits is overkill here — invoice sizes are small, so treat
	// comma as the decimal separator and drop stray spaces.
	return parseFloat(raw.replace(',', '.'));
}

function build(unitsPerPack: number, unitSize: number, token: string): PackInfo | null {
	const base = SIZE_TO_BASE[token];
	if (!base || !(unitsPerPack > 0) || !(unitSize > 0)) return null;
	return {
		unitsPerPack,
		unitSize,
		sizeUnit: token,
		baseUnit: base.base,
		baseQuantity: unitsPerPack * unitSize * base.factor,
	};
}

// "6x1L", "12 x 330 ml", "6 X 1,5 kg" — multipack with an explicit sub-size.
const MULTIPACK = /(\d+)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)\b/;
// "Garrafa 5L", "Bolsa 2,5 kg", "500 g", "75cl" — a single size token.
const SINGLE = /(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)\b/g;
// "caja 12 ud", "12 uds", "pack 6", "estuche de 24" — a count of pieces.
const COUNT = /(?:caja|cajas|pack|packs|paquete|paquetes|estuche|estuches|blister|bandeja|display|lote|caja de|pack de)\s*(?:de\s*)?(\d+)\b/;

/**
 * Parse pack info from a line. Tries the description first, then the unit
 * column. Returns null when no size can be determined.
 */
export function parsePack(description: string | null | undefined, unit?: string | null): PackInfo | null {
	for (const source of [description ?? '', unit ?? '']) {
		const s = source.trim();
		if (!s) continue;

		const multi = MULTIPACK.exec(s);
		if (multi) {
			const token = sizeToken(multi[3]);
			if (token) {
				const info = build(num(multi[1]), num(multi[2]), token);
				if (info) return info;
			}
		}

		// Single size token — scan all matches, take the first with a real unit
		// (so "Aceite 5L caja" picks "5L", not a stray number elsewhere).
		SINGLE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = SINGLE.exec(s)) !== null) {
			const token = sizeToken(m[2]);
			if (token) {
				const info = build(1, num(m[1]), token);
				if (info) return info;
			}
		}

		const count = COUNT.exec(s);
		if (count) {
			const info = build(num(count[1]), 1, 'ud');
			if (info) return info;
		}
	}
	return null;
}

/**
 * €/base-unit for a line, i.e. unit_price divided by the pack's base content.
 * "Garrafa 5L" at 12.50 → 2.50 €/L. Null when price or pack is missing.
 */
export function normalizedUnitPrice(unitPrice: number | null | undefined, pack: PackInfo | null): number | null {
	if (unitPrice == null || pack == null || pack.baseQuantity <= 0) return null;
	return Math.round((unitPrice / pack.baseQuantity) * 10000) / 10000;
}
