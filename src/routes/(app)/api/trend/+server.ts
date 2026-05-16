import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { invoices } from '$lib/server/schema';
import { sql } from 'drizzle-orm';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function monday(d: Date): Date {
	const diff = (d.getDay() + 6) % 7;
	const m = new Date(d);
	m.setDate(d.getDate() - diff);
	return m;
}

function isoDate(d: Date): string {
	return d.toISOString().split('T')[0];
}

export const GET: RequestHandler = ({ url }) => {
	const VALID = new Set(['daily', 'weekly', 'monthly', 'yearly']);
	let scale = url.searchParams.get('scale') ?? 'monthly';
	if (!VALID.has(scale)) scale = 'monthly';

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	type Bucket = { label: string; total: number; pct: number; is_current: boolean };
	let buckets: Bucket[] = [];

	if (scale === 'daily') {
		const keys: string[] = [];
		for (let i = 13; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(today.getDate() - i);
			keys.push(isoDate(d));
		}
		const rows = db
			.select({
				key:   sql<string>`strftime('%Y-%m-%d', ${invoices.invoiceDate})`,
				total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)`,
			})
			.from(invoices)
			.where(sql`${invoices.invoiceDate} >= date('now', '-13 days')`)
			.groupBy(sql`strftime('%Y-%m-%d', ${invoices.invoiceDate})`)
			.orderBy(sql`strftime('%Y-%m-%d', ${invoices.invoiceDate})`)
			.all();
		const map = Object.fromEntries(rows.map((r) => [r.key, r.total]));
		const todayKey = isoDate(today);
		buckets = keys.map((k) => {
			const d = new Date(k);
			return { label: `${DAY_ABBR[d.getDay()]} ${d.getDate()}`, total: map[k] ?? 0, pct: 0, is_current: k === todayKey };
		});

	} else if (scale === 'weekly') {
		const mondays: string[] = [];
		for (let i = 7; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(today.getDate() - i * 7);
			mondays.push(isoDate(monday(d)));
		}
		const weekKey = sql<string>`date(${invoices.invoiceDate}, '-' || ((strftime('%w', ${invoices.invoiceDate})+6)%7) || ' days')`;
		const rows = db
			.select({
				key:   weekKey,
				total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)`,
			})
			.from(invoices)
			.where(sql`${invoices.invoiceDate} >= date('now', '-56 days')`)
			.groupBy(weekKey)
			.orderBy(weekKey)
			.all();
		const map = Object.fromEntries(rows.map((r) => [r.key, r.total]));
		const currentMonday = isoDate(monday(today));
		buckets = mondays.map((k) => {
			const d = new Date(k);
			return { label: `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`, total: map[k] ?? 0, pct: 0, is_current: k === currentMonday };
		});

	} else if (scale === 'yearly') {
		const year = today.getFullYear();
		const keys = [year - 4, year - 3, year - 2, year - 1, year].map(String);
		const yearKey = sql<string>`strftime('%Y', ${invoices.invoiceDate})`;
		const rows = db
			.select({
				key:   yearKey,
				total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)`,
			})
			.from(invoices)
			.where(sql`strftime('%Y', ${invoices.invoiceDate}) >= strftime('%Y', date('now', '-4 years'))`)
			.groupBy(yearKey)
			.orderBy(yearKey)
			.all();
		const map = Object.fromEntries(rows.map((r) => [r.key, r.total]));
		buckets = keys.map((k) => ({ label: k, total: map[k] ?? 0, pct: 0, is_current: k === String(year) }));

	} else { // monthly
		const keys: string[] = [];
		for (let i = 11; i >= 0; i--) {
			let month = today.getMonth() + 1 - i;
			let year = today.getFullYear();
			while (month <= 0) { month += 12; year--; }
			keys.push(`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`);
		}
		const monthKey = sql<string>`strftime('%Y-%m', ${invoices.invoiceDate})`;
		const rows = db
			.select({
				key:   monthKey,
				total: sql<number>`COALESCE(SUM(COALESCE(${invoices.totalAmount}, 0)), 0)`,
			})
			.from(invoices)
			.where(sql`strftime('%Y-%m', ${invoices.invoiceDate}) >= strftime('%Y-%m', date('now', '-11 months'))`)
			.groupBy(monthKey)
			.orderBy(monthKey)
			.all();
		const map = Object.fromEntries(rows.map((r) => [r.key, r.total]));
		const currentKey = `${String(today.getFullYear()).padStart(4,'0')}-${String(today.getMonth()+1).padStart(2,'0')}`;
		buckets = keys.map((k) => {
			const monthNum = parseInt(k.substring(5, 7), 10) - 1;
			return { label: MONTH_ABBR[monthNum], total: map[k] ?? 0, pct: 0, is_current: k === currentKey };
		});
	}

	const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
	for (const b of buckets) {
		b.pct = Math.round((b.total / maxTotal) * 100);
	}

	return json({ scale, buckets });
};
