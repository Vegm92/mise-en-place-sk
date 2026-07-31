import { canonicalizeUnit } from './normalize';

export type BaseUnit = 'kg' | 'L' | 'ud';

export interface PackInfo {
	unitsPerPack: number;
	unitSize: number;
	sizeUnit: string;
	baseQuantity: number;
	baseUnit: BaseUnit;
}

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

function sizeToken(raw: string): string | null {
	const canonical = canonicalizeUnit(raw);
	if (canonical && SIZE_TO_BASE[canonical]) return canonical;
	return null;
}

function num(raw: string): number {
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

const MULTIPACK = /(\d+)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)\b/;
const SINGLE = /(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)\b/g;
const COUNT = /(?:caja|cajas|pack|packs|paquete|paquetes|estuche|estuches|blister|bandeja|display|lote|caja de|pack de)\s*(?:de\s*)?(\d+)\b/;

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

export function normalizedUnitPrice(unitPrice: number | null | undefined, pack: PackInfo | null): number | null {
	if (unitPrice == null || pack == null || pack.baseQuantity <= 0) return null;
	return Math.round((unitPrice / pack.baseQuantity) * 10000) / 10000;
}
