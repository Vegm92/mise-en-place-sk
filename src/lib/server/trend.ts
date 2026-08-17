import { db, forTenant } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { UNCATEGORIZED_CATEGORY } from '$lib/constants';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const RANGE_TO_DAYS: Record<string, number> = { '7d': 6, '30d': 29, '90d': 89, '1y': 364 };
const VALID_RANGES = new Set(['7d', '30d', '90d', '1y', 'all']);
const VALID_GRANULARITIES = new Set(['daily', 'weekly', 'monthly']);
const MAX_BUCKETS = 400;

function addDays(d: Date, days: number): Date {
	const r = new Date(d); r.setDate(r.getDate() + days); return r;
}

function addMonths(d: Date, months: number): Date {
	const r = new Date(d); r.setMonth(r.getMonth() + months); return r;
}

function monday(d: Date): Date {
	return addDays(d, -((d.getDay() + 6) % 7));
}

function firstOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function monthKeyStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type Segment = { category: string | null; amount: number };
export type Bucket  = { label: string; total: number; pct: number; is_current: boolean; segments: Segment[] };

function buildSegments(
	rows: { key: string; category: string | null; amount: number }[],
	key: string,
): Segment[] {
	return rows
		.filter(r => r.key === key)
		.map(r => ({ category: r.category, amount: r.amount }));
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

	let startDate: Date;
	if (range === 'all') {
		const [row] = await db
			.select({ minDate: sql<string | null>`MIN(${invoices.invoiceDate})::text` })
			.from(invoices)
			.where(and(tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)));
		startDate = row?.minDate ? new Date(row.minDate) : addDays(today, -364);
	} else {
		startDate = addDays(today, -(RANGE_TO_DAYS[range] ?? 29));
	}

	const dayKey   = sql<string>`TO_CHAR(${invoices.invoiceDate}, 'YYYY-MM-DD')`;
	const weekKey  = sql<string>`DATE_TRUNC('week', ${invoices.invoiceDate})::date::text`;
	const monthKey = sql<string>`TO_CHAR(${invoices.invoiceDate}, 'YYYY-MM')`;

	let bucketDates: Date[] = [];
	if (granularity === 'daily') {
		for (let d = new Date(startDate); d <= today; d = addDays(d, 1)) bucketDates.push(d);
	} else if (granularity === 'monthly') {
		for (let d = firstOfMonth(startDate); d <= firstOfMonth(today); d = addMonths(d, 1)) bucketDates.push(d);
	} else {
		for (let d = monday(startDate); d <= monday(today); d = addDays(d, 7)) bucketDates.push(d);
	}
	if (bucketDates.length > MAX_BUCKETS) bucketDates = bucketDates.slice(bucketDates.length - MAX_BUCKETS);
	const clampedStart = bucketDates.length ? isoDate(bucketDates[0]!) : isoDate(startDate);
	const keys = bucketDates.map(d => granularity === 'monthly' ? monthKeyStr(d) : isoDate(d));

	const keyExpr = granularity === 'daily' ? dayKey : granularity === 'monthly' ? monthKey : weekKey;
	const groupedRows = await db
		.select({
			key: keyExpr,
			category: suppliers.category,
			amount: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)`,
		})
		.from(invoices)
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(and(
			tdb.scope(invoices.restaurantId),
			isNull(invoices.deletedAt),
			sql`${invoices.invoiceDate} >= ${clampedStart}::date`,
		))
		.groupBy(keyExpr, suppliers.category)
		.orderBy(keyExpr);

	type TrendRow = { key: string; category: string; amount: number };
	const rows: TrendRow[] = [];
	const byBucket = new Map<string, Map<string, TrendRow>>();
	for (const row of groupedRows) {
		const category = row.category ?? UNCATEGORIZED_CATEGORY;
		let bucket = byBucket.get(row.key);
		if (!bucket) {
			bucket = new Map();
			byBucket.set(row.key, bucket);
		}
		const existing = bucket.get(category);
		if (existing) {
			existing.amount += Number(row.amount);
		} else {
			const merged: TrendRow = { key: row.key, category, amount: Number(row.amount) };
			bucket.set(category, merged);
			rows.push(merged);
		}
	}

	const spansMultipleYears = startDate.getFullYear() !== today.getFullYear();

	function labelFor(key: string): string {
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

	const currentKey =
		granularity === 'daily'   ? isoDate(today) :
		granularity === 'monthly' ? monthKeyStr(today) :
		isoDate(monday(today));

	const buckets: Bucket[] = keys.map(k => {
		const segs = buildSegments(rows, k);
		return { label: labelFor(k), total: segs.reduce((s, r) => s + r.amount, 0), pct: 0, is_current: k === currentKey, segments: segs };
	});

	const maxTotal = Math.max(...buckets.map(b => b.total), 1);
	for (const b of buckets) b.pct = Math.round((b.total / maxTotal) * 100);

	const catSet = new Set<string | null>();
	for (const b of buckets) for (const s of b.segments) catSet.add(s.category);

	return { range, granularity, buckets, categories: [...catSet] };
}
