import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { invoices, suppliers } from '$lib/server/schema';
import { sql, eq, and } from 'drizzle-orm';
import { checkRateLimit } from '$lib/server/rate-limiter';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function monday(d: Date): Date {
	const diff = (d.getDay() + 6) % 7;
	const m = new Date(d);
	m.setDate(d.getDate() - diff);
	return m;
}

function isoDate(d: Date): string {
	return d.toISOString().split('T')[0]!;
}

type Segment = { category: string | null; amount: number };
type Bucket  = { label: string; total: number; pct: number; is_current: boolean; segments: Segment[] };

function buildSegments(
	rows: { key: string; category: string | null; amount: number }[],
	key: string,
): Segment[] {
	return rows
		.filter(r => r.key === key)
		.map(r => ({ category: r.category, amount: r.amount }));
}

export const GET: RequestHandler = async ({ url, getClientAddress, locals }) => {
	if (!checkRateLimit(getClientAddress(), 60)) throw error(429, 'Too many requests');
	const rid = locals.restaurantId!;

	const VALID = new Set(['daily', 'weekly', 'monthly', 'yearly', '7d', '30d', '90d']);
	let scale = url.searchParams.get('scale') ?? 'monthly';
	if (!VALID.has(scale)) scale = 'monthly';

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	let buckets: Bucket[] = [];

	// Postgres date key helpers
	const dayKey   = sql<string>`TO_CHAR((${invoices.invoiceDate})::date, 'YYYY-MM-DD')`;
	const weekKey  = sql<string>`DATE_TRUNC('week', (${invoices.invoiceDate})::date)::date::text`;
	const monthKey = sql<string>`TO_CHAR((${invoices.invoiceDate})::date, 'YYYY-MM')`;
	const yearKey  = sql<string>`TO_CHAR((${invoices.invoiceDate})::date, 'YYYY')`;

	if (scale === '7d') {
		const keys: string[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(today); d.setDate(today.getDate() - i); keys.push(isoDate(d));
		}
		const rows = await db
			.select({ key: dayKey, category: suppliers.category, amount: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
			.from(invoices)
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(and(eq(invoices.restaurantId, rid), sql`(${invoices.invoiceDate})::date >= CURRENT_DATE - INTERVAL '6 days'`))
			.groupBy(dayKey, suppliers.category)
			.orderBy(dayKey);
		const todayKey = isoDate(today);
		buckets = keys.map(k => {
			const segs = buildSegments(rows, k);
			return { label: `${DAY_ABBR[new Date(k).getDay()]} ${new Date(k).getDate()}`, total: segs.reduce((s, r) => s + r.amount, 0), pct: 0, is_current: k === todayKey, segments: segs };
		});

	} else if (scale === '30d') {
		const mondays: string[] = [];
		for (let i = 4; i >= 0; i--) {
			const d = new Date(today); d.setDate(today.getDate() - i * 7); mondays.push(isoDate(monday(d)));
		}
		const rows = await db
			.select({ key: weekKey, category: suppliers.category, amount: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
			.from(invoices)
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(and(eq(invoices.restaurantId, rid), sql`(${invoices.invoiceDate})::date >= CURRENT_DATE - INTERVAL '29 days'`))
			.groupBy(weekKey, suppliers.category)
			.orderBy(weekKey);
		const currentMonday = isoDate(monday(today));
		buckets = mondays.map(k => {
			const segs = buildSegments(rows, k);
			const d = new Date(k);
			return { label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`, total: segs.reduce((s, r) => s + r.amount, 0), pct: 0, is_current: k === currentMonday, segments: segs };
		});

	} else if (scale === '90d') {
		const keys: string[] = [];
		for (let i = 2; i >= 0; i--) {
			let month = today.getMonth() + 1 - i; let year = today.getFullYear();
			while (month <= 0) { month += 12; year--; }
			keys.push(`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`);
		}
		const rows = await db
			.select({ key: monthKey, category: suppliers.category, amount: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
			.from(invoices)
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(and(eq(invoices.restaurantId, rid), sql`TO_CHAR((${invoices.invoiceDate})::date, 'YYYY-MM') >= TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM')`))
			.groupBy(monthKey, suppliers.category)
			.orderBy(monthKey);
		const currentKey = `${String(today.getFullYear()).padStart(4,'0')}-${String(today.getMonth()+1).padStart(2,'0')}`;
		buckets = keys.map(k => {
			const segs = buildSegments(rows, k);
			const monthNum = parseInt(k.substring(5, 7), 10) - 1;
			return { label: MONTH_ABBR[monthNum]!, total: segs.reduce((s, r) => s + r.amount, 0), pct: 0, is_current: k === currentKey, segments: segs };
		});

	} else if (scale === 'daily') {
		const keys: string[] = [];
		for (let i = 13; i >= 0; i--) {
			const d = new Date(today); d.setDate(today.getDate() - i); keys.push(isoDate(d));
		}
		const rows = await db
			.select({ key: dayKey, total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
			.from(invoices)
			.where(and(eq(invoices.restaurantId, rid), sql`(${invoices.invoiceDate})::date >= CURRENT_DATE - INTERVAL '13 days'`))
			.groupBy(dayKey)
			.orderBy(dayKey);
		const map = Object.fromEntries(rows.map((r: { key: string; total: number }) => [r.key, r.total]));
		const todayKey = isoDate(today);
		buckets = keys.map(k => {
			const d = new Date(k);
			return { label: `${DAY_ABBR[d.getDay()]} ${d.getDate()}`, total: map[k] ?? 0, pct: 0, is_current: k === todayKey, segments: [] };
		});

	} else if (scale === 'weekly') {
		const mondays: string[] = [];
		for (let i = 7; i >= 0; i--) {
			const d = new Date(today); d.setDate(today.getDate() - i * 7); mondays.push(isoDate(monday(d)));
		}
		const rows = await db
			.select({ key: weekKey, total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
			.from(invoices)
			.where(and(eq(invoices.restaurantId, rid), sql`(${invoices.invoiceDate})::date >= CURRENT_DATE - INTERVAL '56 days'`))
			.groupBy(weekKey)
			.orderBy(weekKey);
		const map = Object.fromEntries(rows.map((r: { key: string; total: number }) => [r.key, r.total]));
		const currentMonday = isoDate(monday(today));
		buckets = mondays.map(k => {
			const d = new Date(k);
			return { label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`, total: map[k] ?? 0, pct: 0, is_current: k === currentMonday, segments: [] };
		});

	} else if (scale === 'yearly') {
		const year = today.getFullYear();
		const keys = [year - 4, year - 3, year - 2, year - 1, year].map(String);
		const rows = await db
			.select({ key: yearKey, total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
			.from(invoices)
			.where(and(eq(invoices.restaurantId, rid), sql`TO_CHAR((${invoices.invoiceDate})::date, 'YYYY') >= TO_CHAR(CURRENT_DATE - INTERVAL '4 years', 'YYYY')`))
			.groupBy(yearKey)
			.orderBy(yearKey);
		const map = Object.fromEntries(rows.map((r: { key: string; total: number }) => [r.key, r.total]));
		buckets = keys.map(k => ({ label: k, total: map[k] ?? 0, pct: 0, is_current: k === String(year), segments: [] }));

	} else { // monthly
		const keys: string[] = [];
		for (let i = 11; i >= 0; i--) {
			let month = today.getMonth() + 1 - i; let year = today.getFullYear();
			while (month <= 0) { month += 12; year--; }
			keys.push(`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`);
		}
		const rows = await db
			.select({ key: monthKey, total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)` })
			.from(invoices)
			.where(and(eq(invoices.restaurantId, rid), sql`TO_CHAR((${invoices.invoiceDate})::date, 'YYYY-MM') >= TO_CHAR(CURRENT_DATE - INTERVAL '11 months', 'YYYY-MM')`))
			.groupBy(monthKey)
			.orderBy(monthKey);
		const map = Object.fromEntries(rows.map((r: { key: string; total: number }) => [r.key, r.total]));
		const currentKey = `${String(today.getFullYear()).padStart(4,'0')}-${String(today.getMonth()+1).padStart(2,'0')}`;
		buckets = keys.map(k => {
			const monthNum = parseInt(k.substring(5, 7), 10) - 1;
			return { label: MONTH_ABBR[monthNum]!, total: map[k] ?? 0, pct: 0, is_current: k === currentKey, segments: [] };
		});
	}

	const maxTotal = Math.max(...buckets.map(b => b.total), 1);
	for (const b of buckets) b.pct = Math.round((b.total / maxTotal) * 100);

	const catSet = new Set<string | null>();
	for (const b of buckets) for (const s of b.segments) catSet.add(s.category);

	return json({ scale, buckets, categories: [...catSet] });
};
