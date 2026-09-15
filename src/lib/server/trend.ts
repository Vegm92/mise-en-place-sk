import { db, forTenant } from '$lib/server/db';
import { invoiceLineItems, invoices, products, suppliers } from '$lib/server/schema';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoinOn } from './category-spend';
import { addDays, addMonths, monday, firstOfMonth, isoDate, monthKeyStr } from './dates';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const RANGE_TO_DAYS: Record<string, number> = { '7d': 6, '30d': 29, '90d': 89, '1y': 364 };
const VALID_RANGES = new Set(['7d', '30d', '90d', '1y', 'all']);
const VALID_GRANULARITIES = new Set(['daily', 'weekly', 'monthly']);
const MAX_BUCKETS = 400;

export type Segment = { category: string | null; amount: number };
export type Bucket  = { label: string; total: number; pct: number; is_current: boolean; segments: Segment[] };

type TenantScope = ReturnType<typeof forTenant>;
type TrendRow = { key: string; category: string; amount: number };

async function resolveStartDate(tdb: TenantScope, range: string, today: Date): Promise<Date> {
	if (range !== 'all') return addDays(today, -(RANGE_TO_DAYS[range] ?? 29));
	const [row] = await db
		.select({ minDate: sql<string | null>`MIN(${invoices.invoiceDate})::text` })
		.from(invoices)
		.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)));
	return row?.minDate ? new Date(row.minDate) : addDays(today, -364);
}

function bucketDatesFor(granularity: string, startDate: Date, today: Date): Date[] {
	const dates: Date[] = [];
	if (granularity === 'daily') {
		for (let d = new Date(startDate); d <= today; d = addDays(d, 1)) dates.push(d);
	} else if (granularity === 'monthly') {
		for (let d = firstOfMonth(startDate); d <= firstOfMonth(today); d = addMonths(d, 1)) dates.push(d);
	} else {
		for (let d = monday(startDate); d <= monday(today); d = addDays(d, 7)) dates.push(d);
	}
	return dates.length > MAX_BUCKETS ? dates.slice(dates.length - MAX_BUCKETS) : dates;
}

function currentKeyFor(granularity: string, today: Date): string {
	if (granularity === 'daily') return isoDate(today);
	if (granularity === 'monthly') return monthKeyStr(today);
	return isoDate(monday(today));
}

function labelForKey(key: string, granularity: string, spansMultipleYears: boolean): string {
	if (granularity === 'daily') {
		const d = new Date(key);
		return `${DAY_ABBR[d.getDay()]} ${d.getDate()}`;
	}
	if (granularity === 'monthly') {
		const monthNum = parseInt(key.substring(5, 7), 10) - 1;
		const year = key.substring(2, 4);
		return spansMultipleYears ? `${MONTH_ABBR[monthNum]} '${year}` : MONTH_ABBR[monthNum]!;
	}
	const d = new Date(key);
	return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function indexTrendSegments(
	groupedRows: { key: string; category: string | null; amount: number }[]
): Map<string, Segment[]> {
	const map = new Map<string, Map<string, number>>();
	for (let i = 0; i < groupedRows.length; i++) {
		const row = groupedRows[i]!;
		const category = row.category ?? UNCATEGORIZED_CATEGORY;
		let categoryMap = map.get(row.key);
		if (!categoryMap) {
			categoryMap = new Map();
			map.set(row.key, categoryMap);
		}
		const amt = Number(row.amount);
		const current = categoryMap.get(category);
		if (current !== undefined) {
			categoryMap.set(category, current + amt);
		} else {
			categoryMap.set(category, amt);
		}
	}

	const segmentsByKey = new Map<string, Segment[]>();
	for (const [key, categoryMap] of map.entries()) {
		const segments: Segment[] = [];
		for (const [category, amount] of categoryMap.entries()) {
			segments.push({ category, amount });
		}
		segmentsByKey.set(key, segments);
	}
	return segmentsByKey;
}

export function normalizeRange(raw: string | null): string {
	return raw && VALID_RANGES.has(raw) ? raw : '30d';
}

export function normalizeGranularity(raw: string | null): string {
	return raw && VALID_GRANULARITIES.has(raw) ? raw : 'weekly';
}

export async function getTrendDataByRange(rid: string, rangeParam: string | null, granularityParam: string | null) {
	const tdb = forTenant(rid);
	const range = normalizeRange(rangeParam);
	const granularity = normalizeGranularity(granularityParam);

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const startDate = await resolveStartDate(tdb, range, today);

	const dayKey   = sql<string>`TO_CHAR(${invoices.invoiceDate}, 'YYYY-MM-DD')`;
	const weekKey  = sql<string>`DATE_TRUNC('week', ${invoices.invoiceDate})::date::text`;
	const monthKey = sql<string>`TO_CHAR(${invoices.invoiceDate}, 'YYYY-MM')`;

	const bucketDates = bucketDatesFor(granularity, startDate, today);
	const clampedStart = bucketDates.length ? isoDate(bucketDates[0]!) : isoDate(startDate);
	const keys = bucketDates.map(d => granularity === 'monthly' ? monthKeyStr(d) : isoDate(d));

	let keyExpr = weekKey;
	if (granularity === 'daily') keyExpr = dayKey;
	else if (granularity === 'monthly') keyExpr = monthKey;
	const categoryExpr = lineCategoryExpr();
	const groupedRows = await db
		.select({
			key: keyExpr,
			category: categoryExpr,
			amount: sql<number>`COALESCE(SUM(${lineAmountExpr()}), 0)::float8`,
		})
		.from(invoiceLineItems)
		.innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.leftJoin(products, lineProductJoinOn())
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNull(invoices.deletedAt),
			describedLine(),
			sql`${invoices.invoiceDate} >= ${clampedStart}::date`,
		))
		.groupBy(keyExpr, categoryExpr)
		.orderBy(keyExpr);

	const segmentsByKey = indexTrendSegments(groupedRows);

	const spansMultipleYears = startDate.getFullYear() !== today.getFullYear();
	const currentKey = currentKeyFor(granularity, today);

	const buckets: Bucket[] = keys.map(k => {
		const segs = segmentsByKey.get(k) ?? [];
		const label = labelForKey(k, granularity, spansMultipleYears);
		let total = 0;
		for (let i = 0; i < segs.length; i++) total += segs[i]!.amount;
		return { label, total, pct: 0, is_current: k === currentKey, segments: segs };
	});

	const maxTotal = Math.max(...buckets.map(b => b.total), 1);
	for (const b of buckets) b.pct = Math.round((b.total / maxTotal) * 100);

	const catSet = new Set<string | null>();
	for (const b of buckets) for (const s of b.segments) catSet.add(s.category);

	return { range, granularity, buckets, categories: [...catSet] };
}
