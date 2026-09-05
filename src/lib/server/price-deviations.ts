import { sql } from 'drizzle-orm';
import { db } from './db';
import { normalizeProductKey } from './normalize';
import { addDaysIso } from '$lib/period';

export interface DeviationLine {
	productId: number | null;
	description: string;
	supplierId: number | null;
	supplierName: string;
	invoiceDate: string;
	unit: string | null;
	unitPrice: number | null;
	normalizedUnitPrice: number | null;
	baseUnit: string | null;
	totalPrice: number;
}

export interface SupplierAlternative {
	supplierId: number | null;
	supplierName: string;
	price: number;
	basis: string;
	asOf: string;
	savingsPct: number;
	potentialSavings: number;
}

export interface PriceDeviation {
	key: string;
	productId: number | null;
	description: string;
	supplierId: number | null;
	supplierName: string;
	basis: string;
	referencePrice: number;
	latestPrice: number;
	deviationPct: number;
	extraPaid: number;
	lineCount: number;
	lastDate: string;
	alternative: SupplierAlternative | null;
}

export interface SupplierPrice {
	supplierId: number | null;
	supplierName: string;
	price: number;
	basis: string;
	asOf: string;
	vsCheapestPct: number;
}

export const DEFAULT_DEVIATION_THRESHOLD = 0.15;
export const ALTERNATIVE_LOOKBACK_DAYS = 180;
const REFERENCE_SAMPLE = 3;

interface Comparable { price: number; basis: string }

export function comparablePrice(line: Pick<DeviationLine, 'unit' | 'unitPrice' | 'normalizedUnitPrice' | 'baseUnit'>): Comparable | null {
	if (line.normalizedUnitPrice != null && line.normalizedUnitPrice > 0 && line.baseUnit) {
		return { price: line.normalizedUnitPrice, basis: line.baseUnit };
	}
	if (line.unitPrice != null && line.unitPrice > 0) {
		return { price: line.unitPrice, basis: `unit:${(line.unit ?? '').trim().toLowerCase()}` };
	}
	return null;
}

export function lineKey(line: Pick<DeviationLine, 'productId' | 'description'>): string {
	return line.productId != null ? `p:${line.productId}` : `d:${normalizeProductKey(line.description)}`;
}

function median(values: number[]): number {
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

export function overpaidOnLine(totalPrice: number, deviation: number): number {
	if (deviation <= 0 || totalPrice <= 0) return 0;
	return totalPrice * (deviation / (1 + deviation));
}

interface Priced extends DeviationLine { cmp: Comparable }

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const bucket = out.get(k);
		if (bucket) bucket.push(item);
		else out.set(k, [item]);
	}
	return out;
}

function supplierKey(line: Pick<DeviationLine, 'supplierId' | 'supplierName'>): string {
	return line.supplierId != null ? `s:${line.supplierId}` : `n:${line.supplierName.trim().toLowerCase()}`;
}

function latestOffers(priced: Priced[], since: string): Map<string, Map<string, Priced>> {
	const offers = new Map<string, Map<string, Priced>>();
	for (const line of priced) {
		if (line.invoiceDate < since) continue;
		const key = lineKey(line);
		const bySupplier = offers.get(key) ?? new Map<string, Priced>();
		bySupplier.set(supplierKey(line), line);
		offers.set(key, bySupplier);
	}
	return offers;
}

function cheapestAlternative(
	key: string,
	own: Priced,
	latestPrice: number,
	inRangeSpend: number,
	offers: Map<string, Map<string, Priced>>,
): SupplierAlternative | null {
	let best: Priced | null = null;
	for (const [sk, offer] of offers.get(key) ?? []) {
		if (sk === supplierKey(own) || offer.cmp.basis !== own.cmp.basis) continue;
		if (offer.cmp.price >= latestPrice) continue;
		if (!best || offer.cmp.price < best.cmp.price) best = offer;
	}
	if (!best) return null;
	const savingsPct = (latestPrice - best.cmp.price) / latestPrice;
	return {
		supplierId: best.supplierId,
		supplierName: best.supplierName,
		price: best.cmp.price,
		basis: best.cmp.basis,
		asOf: best.invoiceDate,
		savingsPct,
		potentialSavings: inRangeSpend * savingsPct,
	};
}

export function computePriceDeviations(
	lines: DeviationLine[],
	rangeFrom: string,
	rangeTo: string,
	threshold = DEFAULT_DEVIATION_THRESHOLD,
): PriceDeviation[] {
	const priced: Priced[] = lines
		.map((line) => ({ line, cmp: comparablePrice(line) }))
		.filter((x): x is { line: DeviationLine; cmp: Comparable } => x.cmp !== null)
		.map(({ line, cmp }) => ({ ...line, cmp }))
		.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
	const offers = latestOffers(priced, addDaysIso(rangeTo, -ALTERNATIVE_LOOKBACK_DAYS));
	const groups = groupBy(priced, (l) => `${lineKey(l)}|${supplierKey(l)}|${l.cmp.basis}`);
	const out: PriceDeviation[] = [];

	for (const group of groups.values()) {
		let latest: { line: Priced; reference: number; deviation: number } | null = null;
		let extraPaid = 0;
		let inRangeSpend = 0;
		let lineCount = 0;
		for (let i = 0; i < group.length; i++) {
			const line = group[i]!;
			if (line.invoiceDate < rangeFrom || line.invoiceDate > rangeTo) continue;
			const previous = group.slice(Math.max(0, i - REFERENCE_SAMPLE), i).map((p) => p.cmp.price);
			if (previous.length === 0) continue;
			const reference = median(previous);
			if (reference <= 0) continue;
			const deviation = (line.cmp.price - reference) / reference;
			lineCount++;
			inRangeSpend += line.totalPrice;
			extraPaid += overpaidOnLine(line.totalPrice, deviation);
			latest = { line, reference, deviation };
		}
		if (!latest || latest.deviation < threshold) continue;
		const key = lineKey(latest.line);
		out.push({
			key,
			productId: latest.line.productId,
			description: latest.line.description,
			supplierId: latest.line.supplierId,
			supplierName: latest.line.supplierName,
			basis: latest.line.cmp.basis,
			referencePrice: latest.reference,
			latestPrice: latest.line.cmp.price,
			deviationPct: Math.round(latest.deviation * 1000) / 10,
			extraPaid,
			lineCount,
			lastDate: latest.line.invoiceDate,
			alternative: cheapestAlternative(key, latest.line, latest.line.cmp.price, inRangeSpend, offers),
		});
	}
	return out.sort((a, b) => b.extraPaid - a.extraPaid || b.deviationPct - a.deviationPct);
}

type LineRow = Record<string, unknown>;

function toLine(r: LineRow): DeviationLine {
	return {
		productId: r.product_id == null ? null : Number(r.product_id),
		description: String(r.description ?? ''),
		supplierId: r.supplier_id == null ? null : Number(r.supplier_id),
		supplierName: String(r.supplier_name ?? ''),
		invoiceDate: String(r.invoice_date),
		unit: r.unit == null ? null : String(r.unit),
		unitPrice: r.unit_price == null ? null : Number(r.unit_price),
		normalizedUnitPrice: r.normalized_unit_price == null ? null : Number(r.normalized_unit_price),
		baseUnit: r.base_unit == null ? null : String(r.base_unit),
		totalPrice: Number(r.total_price ?? 0),
	};
}

export async function loadDeviationLines(rid: string, rangeFrom: string, rangeTo: string): Promise<DeviationLine[]> {
	const since = addDaysIso(rangeFrom, -ALTERNATIVE_LOOKBACK_DAYS);
	const rows = await db.execute(sql`
		SELECT ili.product_id, ili.description, i.supplier_id, COALESCE(s.name, '') AS supplier_name,
			i.invoice_date::text AS invoice_date, ili.unit,
			ili.unit_price::float8 AS unit_price, ili.normalized_unit_price::float8 AS normalized_unit_price,
			ili.base_unit, COALESCE(ili.total_price, 0)::float8 AS total_price
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id AND i.restaurant_id = ${rid}
		LEFT JOIN suppliers s ON s.id = i.supplier_id AND s.restaurant_id = ${rid}
		WHERE ili.restaurant_id = ${rid}
			AND i.deleted_at IS NULL
			AND i.invoice_date IS NOT NULL
			AND i.invoice_date >= ${since}::date
			AND i.invoice_date <= ${rangeTo}::date
			AND ili.description IS NOT NULL
		ORDER BY i.invoice_date ASC, i.id ASC, ili.id ASC
	`);
	return (rows as unknown as LineRow[]).map(toLine);
}

export async function priceDeviations(
	rid: string,
	rangeFrom: string,
	rangeTo: string,
	threshold = DEFAULT_DEVIATION_THRESHOLD,
): Promise<PriceDeviation[]> {
	return computePriceDeviations(await loadDeviationLines(rid, rangeFrom, rangeTo), rangeFrom, rangeTo, threshold);
}

export function rankSupplierPrices(lines: DeviationLine[]): SupplierPrice[] {
	const latest = new Map<string, { line: DeviationLine; cmp: Comparable }>();
	for (const line of [...lines].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))) {
		const cmp = comparablePrice(line);
		if (cmp) latest.set(supplierKey(line), { line, cmp });
	}
	const offers = [...latest.values()];
	const basisCounts = groupBy(offers, (o) => o.cmp.basis);
	const [basis] = [...basisCounts.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [null];
	if (!basis) return [];
	const comparable = (basisCounts.get(basis) ?? []).sort((a, b) => a.cmp.price - b.cmp.price);
	const cheapest = comparable[0]!.cmp.price;
	return comparable.map(({ line, cmp }) => ({
		supplierId: line.supplierId,
		supplierName: line.supplierName,
		price: cmp.price,
		basis: cmp.basis,
		asOf: line.invoiceDate,
		vsCheapestPct: cheapest > 0 ? Math.round(((cmp.price - cheapest) / cheapest) * 1000) / 10 : 0,
	}));
}

export async function productSupplierPrices(rid: string, productId: number, today: string): Promise<SupplierPrice[]> {
	const since = addDaysIso(today, -ALTERNATIVE_LOOKBACK_DAYS);
	const rows = await db.execute(sql`
		SELECT ili.product_id, ili.description, i.supplier_id, COALESCE(s.name, '') AS supplier_name,
			i.invoice_date::text AS invoice_date, ili.unit,
			ili.unit_price::float8 AS unit_price, ili.normalized_unit_price::float8 AS normalized_unit_price,
			ili.base_unit, COALESCE(ili.total_price, 0)::float8 AS total_price
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id AND i.restaurant_id = ${rid}
		LEFT JOIN suppliers s ON s.id = i.supplier_id AND s.restaurant_id = ${rid}
		WHERE ili.restaurant_id = ${rid}
			AND ili.product_id = ${productId}
			AND i.deleted_at IS NULL
			AND i.invoice_date IS NOT NULL
			AND i.invoice_date >= ${since}::date
		ORDER BY i.invoice_date ASC, i.id ASC, ili.id ASC
	`);
	return rankSupplierPrices((rows as unknown as LineRow[]).map(toLine));
}
