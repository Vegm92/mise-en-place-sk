import { normalizeProductKey } from './normalize';

export interface ReconLine {
	id: number | string;
	description: string | null;
	productId: number | null;
	quantity: number | null;
	unit: string | null;
	unitPrice: number | null;
	normalizedUnitPrice: number | null;
	baseQuantity?: number | null;
}

export interface LineMismatch {
	a: ReconLine;
	b: ReconLine;
}

export interface LineReconciliation {
	matched: number;
	missingInInvoice: ReconLine[];
	missingInDeliveryNote: ReconLine[];
	quantityMismatches: LineMismatch[];
	priceMismatches: LineMismatch[];
	unitMismatches: LineMismatch[];
	hasDocumentIssue: boolean;
}

const QUANTITY_RELATIVE_TOLERANCE = 0.005;
const QUANTITY_ABSOLUTE_TOLERANCE = 0.01;
const PRICE_RELATIVE_TOLERANCE = 0.05;

function unitToken(unit: string | null): string {
	return (unit ?? '').trim().toLowerCase();
}

function descriptionKey(line: ReconLine): string {
	return normalizeProductKey(line.description ?? '');
}

function quantitiesDiffer(qa: number, qb: number): boolean {
	const allowed = Math.max(
		QUANTITY_ABSOLUTE_TOLERANCE,
		QUANTITY_RELATIVE_TOLERANCE * Math.max(Math.abs(qa), Math.abs(qb)),
	);
	return Math.abs(qa - qb) > allowed;
}

function pricesDiffer(pa: number, pb: number): boolean {
	const base = Math.max(Math.abs(pa), Math.abs(pb));
	if (base === 0) return false;
	return Math.abs(pa - pb) / base > PRICE_RELATIVE_TOLERANCE;
}

interface MatchPass {
	pairs: [ReconLine, ReconLine][];
	remainingA: ReconLine[];
	remainingB: ReconLine[];
}

function greedyMatch(aLines: ReconLine[], bLines: ReconLine[], keyOf: (line: ReconLine) => string | null): MatchPass {
	const pairs: [ReconLine, ReconLine][] = [];
	const usedB = new Set<number>();
	const remainingA: ReconLine[] = [];
	for (const a of aLines) {
		const key = keyOf(a);
		const idx = key === null ? -1 : bLines.findIndex((b, i) => !usedB.has(i) && keyOf(b) === key);
		if (idx === -1) {
			remainingA.push(a);
			continue;
		}
		usedB.add(idx);
		pairs.push([a, bLines[idx]]);
	}
	const remainingB = bLines.filter((_, i) => !usedB.has(i));
	return { pairs, remainingA, remainingB };
}

function matchLines(a: ReconLine[], b: ReconLine[]): MatchPass {
	const byProduct = greedyMatch(a, b, (line) => (line.productId == null ? null : String(line.productId)));
	const byDescription = greedyMatch(byProduct.remainingA, byProduct.remainingB, (line) => descriptionKey(line) || null);
	return {
		pairs: [...byProduct.pairs, ...byDescription.pairs],
		remainingA: byDescription.remainingA,
		remainingB: byDescription.remainingB,
	};
}

function comparablePrices(a: ReconLine, b: ReconLine, sameUnit: boolean): [number, number] | null {
	if (a.normalizedUnitPrice != null && b.normalizedUnitPrice != null) {
		return [a.normalizedUnitPrice, b.normalizedUnitPrice];
	}
	if (sameUnit && a.unitPrice != null && b.unitPrice != null) {
		return [a.unitPrice, b.unitPrice];
	}
	return null;
}

export function reconcileLineItems(a: ReconLine[], b: ReconLine[]): LineReconciliation {
	const { pairs, remainingA, remainingB } = matchLines(a, b);

	const quantityMismatches: LineMismatch[] = [];
	const priceMismatches: LineMismatch[] = [];
	const unitMismatches: LineMismatch[] = [];

	for (const [lineA, lineB] of pairs) {
		const sameUnit = unitToken(lineA.unit) === unitToken(lineB.unit);
		if (sameUnit) {
			if (lineA.quantity != null && lineB.quantity != null && quantitiesDiffer(lineA.quantity, lineB.quantity)) {
				quantityMismatches.push({ a: lineA, b: lineB });
			}
		} else if (lineA.baseQuantity != null && lineB.baseQuantity != null) {
			if (quantitiesDiffer(lineA.baseQuantity, lineB.baseQuantity)) {
				quantityMismatches.push({ a: lineA, b: lineB });
			}
		} else {
			unitMismatches.push({ a: lineA, b: lineB });
		}

		const prices = comparablePrices(lineA, lineB, sameUnit);
		if (prices && pricesDiffer(prices[0], prices[1])) {
			priceMismatches.push({ a: lineA, b: lineB });
		}
	}

	return {
		matched: pairs.length,
		missingInInvoice: remainingA,
		missingInDeliveryNote: remainingB,
		quantityMismatches,
		priceMismatches,
		unitMismatches,
		hasDocumentIssue: remainingA.length > 0 || remainingB.length > 0 || quantityMismatches.length > 0,
	};
}
