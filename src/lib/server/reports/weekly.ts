import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { moneyToNumber } from '$lib/server/money';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin } from '../category-spend';
import type { Cell, ReportDoc } from '$lib/reports';
import {
	DATA_NEUTRAL,
	deltaCell,
	deltaTone,
	fmtPct,
	fmtPlainPct,
	generatedStamp,
	isoWeekRange,
	money,
	moneyPlain,
	pctDelta,
	shiftIsoWeek,
} from './shared';

const DAY_KEYS = ['rep.day.mon', 'rep.day.tue', 'rep.day.wed', 'rep.day.thu', 'rep.day.fri', 'rep.day.sat', 'rep.day.sun'];
const TOP_CATEGORIES = 5;

type TotalsRow = {
	spend: string | null;
	invoice_count: number;
	supplier_count: number;
}

async function periodTotals(rid: string, start: string, end: string) {
	const rows = await db.execute<TotalsRow>(sql`
		SELECT
			COALESCE(SUM(i.total_amount), 0)  AS spend,
			COUNT(*)                          AS invoice_count,
			COUNT(DISTINCT i.supplier_id)     AS supplier_count
		FROM invoices i
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND i.invoice_date BETWEEN ${start} AND ${end}
	`);
	const row = rows[0];
	return {
		spend: moneyToNumber(row?.spend ?? '0'),
		invoices: Number(row?.invoice_count ?? 0),
		suppliers: Number(row?.supplier_count ?? 0),
	};
}

async function categoryTotals(rid: string, start: string, end: string): Promise<Map<string, number>> {
	const rows = await db.execute<{ category: string; spend: string | null }>(sql`
		SELECT
			${lineCategoryExpr()} AS category,
			SUM(${lineAmountExpr()}) AS spend
		FROM invoice_line_items
		JOIN invoices i ON i.id = invoice_line_items.invoice_id
		JOIN suppliers ON suppliers.id = i.supplier_id
		${lineProductJoin()}
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND ${describedLine()}
		  AND i.invoice_date BETWEEN ${start} AND ${end}
		GROUP BY ${lineCategoryExpr()}
	`);
	return new Map(rows.map((r) => [String(r.category), moneyToNumber(r.spend)]));
}

export async function buildWeekly(rid: string, week: string, digest: string | null, now: Date): Promise<ReportDoc> {
	const { start, end } = isoWeekRange(week);
	const prevWeek = shiftIsoWeek(week, -1);
	const prev = isoWeekRange(prevWeek);

	const [current, previous, dayRows, currentCats, previousCats, pendingRows] = await Promise.all([
		periodTotals(rid, start, end),
		periodTotals(rid, prev.start, prev.end),
		db.execute<{ day: string; spend: string | null }>(sql`
			SELECT
				i.invoice_date::text              AS day,
				COALESCE(SUM(i.total_amount), 0)  AS spend
			FROM invoices i
			WHERE i.restaurant_id = ${rid}
			  AND i.deleted_at IS NULL
			  AND i.invoice_date BETWEEN ${start} AND ${end}
			GROUP BY i.invoice_date
		`),
		categoryTotals(rid, start, end),
		categoryTotals(rid, prev.start, prev.end),
		db.execute<{ pending: number }>(sql`
			SELECT COUNT(*) AS pending
			FROM invoices i
			WHERE i.restaurant_id = ${rid}
			  AND i.deleted_at IS NULL
			  AND i.status = 'pending'
			  AND i.invoice_date BETWEEN ${start} AND ${end}
		`),
	]);

	const spendByDay = new Map(dayRows.map((r) => [String(r.day), moneyToNumber(r.spend)]));
	const dayValues = Array.from({ length: 7 }, (_, i) => {
		const iso = new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10);
		return spendByDay.get(iso) ?? 0;
	});
	const maxDay = Math.max(...dayValues, 0) || 1;

	const pending = Number(pendingRows[0]?.pending ?? 0);
	const avgTicket = current.invoices ? current.spend / current.invoices : 0;
	const prevAvgTicket = previous.invoices ? previous.spend / previous.invoices : 0;

	const sorted = [...currentCats.entries()].sort((a, b) => b[1] - a[1]);
	const head = sorted.slice(0, TOP_CATEGORIES);
	const tail = sorted.slice(TOP_CATEGORIES);
	const tailTotal = tail.reduce((sum, [, v]) => sum + v, 0);
	const tailPrev = tail.reduce((sum, [c]) => sum + (previousCats.get(c) ?? 0), 0);
	const share = (value: number) => (current.spend ? fmtPlainPct((value / current.spend) * 100) : '—');
	const sharePct = (value: number) => (current.spend ? Number(((value / current.spend) * 100).toFixed(2)) : null);

	const rows: Record<string, Cell>[] = head.map(([category, value]) => ({
		category: { v: category, kind: 'cat' },
		spend: money(value),
		share: share(value),
		delta: deltaCell(pctDelta(value, previousCats.get(category) ?? 0)),
	}));
	if (tail.length) {
		rows.push({
			category: { v: 'rep.otherCategories', kind: 'key', tone: 'muted' },
			spend: money(tailTotal),
			share: share(tailTotal),
			delta: deltaCell(pctDelta(tailTotal, tailPrev)),
		});
	}

	const weekDelta = pctDelta(current.spend, previous.spend);
	const ticketDelta = pctDelta(avgTicket, prevAvgTicket);

	return {
		type: 'weekly',
		heading: 'rep.weekly.heading',
		eyebrow: 'rep.weekly.eyebrow',
		subheading: { key: 'rep.weekly.subheading', vars: { week, start, end, count: current.invoices } },
		periodIso: week,
		generatedAt: generatedStamp(now),
		kpis: [
			{ label: 'rep.kpi.weekSpend', value: money(current.spend), note: { key: 'rep.kpi.vsPeriod', vars: { delta: fmtPct(weekDelta), period: prevWeek } }, tone: deltaTone(weekDelta) },
			{ label: 'rep.kpi.invoices', value: String(current.invoices), note: { key: 'rep.kpi.fromSuppliers', vars: { n: current.suppliers } }, tone: null },
			{ label: 'rep.kpi.pending', value: String(pending), note: 'rep.kpi.pendingNote', tone: pending > 0 ? 'warn' : null },
			{ label: 'rep.kpi.avgTicket', value: money(avgTicket), note: { key: 'rep.kpi.vsPeriod', vars: { delta: fmtPct(ticketDelta), period: prevWeek } }, tone: deltaTone(ticketDelta) },
		],
		summary: digest,
		chartTitle: 'rep.chart.spendByDay',
		chartNote: 'rep.chart.exVat',
		bars: dayValues.map((value, i) => ({
			label: DAY_KEYS[i]!,
			value: moneyPlain(value),
			pct: Math.round((value / maxDay) * 100),
			color: i >= 5 ? DATA_NEUTRAL : 'var(--mep-acc)',
			muted: i >= 5,
		})),
		tableTitle: 'rep.table.whereItWent',
		columns: [
			{ key: 'category', label: 'rep.col.category', numeric: false },
			{ key: 'spend', label: 'rep.col.spend', numeric: true },
			{ key: 'share', label: 'rep.col.shareWeek', numeric: true },
			{ key: 'delta', label: 'rep.col.vsPrevPeriod', numeric: true },
		],
		rows,
		total: {
			category: { v: 'rep.total', kind: 'key' },
			spend: money(current.spend),
			share: current.spend ? fmtPlainPct(100) : '—',
			delta: deltaCell(weekDelta),
		},
		empty: sorted.length === 0 && current.invoices === 0,
		csv: {
			filename: `cierre-semanal-${week}.csv`,
			header: ['rep.col.category', 'rep.col.spend', 'rep.col.shareWeek', 'rep.col.vsPrevPeriod'],
			rows: [
				...head.map(([category, value]) => [
					category,
					Number(value.toFixed(2)),
					sharePct(value),
					pctDelta(value, previousCats.get(category) ?? 0),
				]),
				...(tail.length
					? [['rep.otherCategories', Number(tailTotal.toFixed(2)), sharePct(tailTotal), pctDelta(tailTotal, tailPrev)]]
					: []),
			],
		},
	};
}
