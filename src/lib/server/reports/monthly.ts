import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { moneyToNumber } from '$lib/server/money';
import { categoryColor } from '$lib/colors';
import { describedLine, lineAmountExpr, lineCategoryExpr, lineProductJoin } from '../category-spend';
import type { Cell, ReportDoc } from '$lib/reports';
import {
	fmtPct,
	fmtPlainPct,
	generatedStamp,
	money,
	moneyPlain,
	pctDelta,
} from './shared';

const OVER_BUDGET_PCT = 100;

function shiftMonth(month: string, delta: number): string {
	let year = Number(month.slice(0, 4));
	let m = Number(month.slice(5, 7)) + delta;
	while (m <= 0) { m += 12; year--; }
	while (m > 12) { m -= 12; year++; }
	return `${year}-${String(m).padStart(2, '0')}`;
}

async function monthSpend(rid: string, month: string): Promise<Map<string, number>> {
	const rows = await db.execute<{ category: string; total: string | null }>(sql`
		SELECT
			${lineCategoryExpr()} AS category,
			SUM(${lineAmountExpr()}) AS total
		FROM invoice_line_items
		JOIN invoices i ON i.id = invoice_line_items.invoice_id
		JOIN suppliers ON suppliers.id = i.supplier_id
		${lineProductJoin()}
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND ${describedLine()}
		  AND TO_CHAR(i.invoice_date, 'YYYY-MM') = ${month}
		GROUP BY ${lineCategoryExpr()}
	`);
	return new Map(rows.map((r) => [String(r.category), moneyToNumber(r.total)]));
}

export async function buildMonthly(rid: string, month: string, now: Date): Promise<ReportDoc> {
	const prevMonth = shiftMonth(month, -1);

	const [current, previous, budgetRows, invoiceRows] = await Promise.all([
		monthSpend(rid, month),
		monthSpend(rid, prevMonth),
		db.execute<{ category: string; monthly_budget: string }>(sql`
			SELECT b.category, b.monthly_budget
			FROM category_budgets b
			WHERE b.restaurant_id = ${rid} AND b.month = ${month}
		`),
		db.execute<{ invoice_count: number; supplier_count: number }>(sql`
			SELECT COUNT(*) AS invoice_count, COUNT(DISTINCT i.supplier_id) AS supplier_count
			FROM invoices i
			WHERE i.restaurant_id = ${rid}
			  AND i.deleted_at IS NULL
			  AND TO_CHAR(i.invoice_date, 'YYYY-MM') = ${month}
		`),
	]);

	const budgets = new Map(budgetRows.map((r) => [String(r.category), moneyToNumber(r.monthly_budget)]));
	const categories = [...new Set([...current.keys(), ...budgets.keys()])]
		.map((category) => ({
			category,
			spend: current.get(category) ?? 0,
			budget: budgets.get(category) ?? 0,
			prev: previous.get(category) ?? 0,
		}))
		.sort((a, b) => b.spend - a.spend);

	const totalSpend = categories.reduce((s, c) => s + c.spend, 0);
	const totalPrev = [...previous.values()].reduce((s, v) => s + v, 0);
	const totalBudget = categories.reduce((s, c) => s + c.budget, 0);
	const overBudget = categories.filter((c) => c.budget > 0 && c.spend > c.budget).length;
	const maxSpend = Math.max(...categories.map((c) => c.spend), 0) || 1;
	const monthDelta = pctDelta(totalSpend, totalPrev);
	const variance = totalSpend - totalBudget;

	const usedCell = (spend: number, budget: number): Cell => {
		if (!budget) return '—';
		const pct = (spend / budget) * 100;
		const text = fmtPlainPct(pct);
		return pct > OVER_BUDGET_PCT ? { v: text, tone: 'up' } : { v: text, tone: 'down' };
	};
	const varianceCell = (spend: number, budget: number): Cell => {
		if (!budget) return '—';
		const diff = spend - budget;
		return { v: money(diff), tone: diff > 0 ? 'up' : 'down' };
	};

	const rows: Record<string, Cell>[] = categories.map((c) => ({
		category: { v: c.category, kind: 'cat' },
		spend: money(c.spend),
		budget: c.budget ? money(c.budget) : '—',
		variance: varianceCell(c.spend, c.budget),
		used: usedCell(c.spend, c.budget),
	}));

	return {
		type: 'monthly',
		heading: 'rep.monthly.heading',
		eyebrow: 'rep.monthly.eyebrow',
		subheading: {
			key: 'rep.monthly.subheading',
			vars: {
				month,
				count: Number(invoiceRows[0]?.invoice_count ?? 0),
				suppliers: Number(invoiceRows[0]?.supplier_count ?? 0),
			},
		},
		periodIso: month,
		generatedAt: generatedStamp(now),
		kpis: [
			{ label: 'rep.kpi.monthSpend', value: money(totalSpend), note: { key: 'rep.kpi.vsPeriod', vars: { delta: fmtPct(monthDelta), period: prevMonth } }, tone: monthDelta && monthDelta > 0 ? 'up' : monthDelta ? 'down' : null },
			{ label: 'rep.kpi.budget', value: totalBudget ? money(totalBudget) : '—', note: totalBudget ? null : 'rep.kpi.noBudget', tone: null },
			{ label: 'rep.kpi.variance', value: totalBudget ? money(variance) : '—', note: null, tone: totalBudget ? (variance > 0 ? 'up' : 'down') : null },
			{ label: 'rep.kpi.overBudget', value: String(overBudget), note: 'rep.kpi.overBudgetNote', tone: overBudget > 0 ? 'warn' : null },
		],
		summary: null,
		chartTitle: 'rep.chart.spendByCategory',
		chartNote: 'rep.chart.exVat',
		bars: categories.slice(0, 8).map((c) => ({
			label: { key: 'rep.rawCategory', vars: { category: c.category } },
			value: moneyPlain(c.spend),
			pct: Math.round((c.spend / maxSpend) * 100),
			color: categoryColor(c.category),
			muted: false,
		})),
		tableTitle: 'rep.table.budgetVsActual',
		columns: [
			{ key: 'category', label: 'rep.col.category', numeric: false },
			{ key: 'spend', label: 'rep.col.spend', numeric: true },
			{ key: 'budget', label: 'rep.col.budget', numeric: true },
			{ key: 'variance', label: 'rep.col.variance', numeric: true },
			{ key: 'used', label: 'rep.col.used', numeric: true },
		],
		rows,
		total: {
			category: { v: 'rep.total', kind: 'key' },
			spend: money(totalSpend),
			budget: totalBudget ? money(totalBudget) : '—',
			variance: varianceCell(totalSpend, totalBudget),
			used: usedCell(totalSpend, totalBudget),
		},
		empty: categories.length === 0,
		csv: {
			filename: `cierre-mensual-${month}.csv`,
			header: ['rep.col.category', 'rep.col.spend', 'rep.col.budget', 'rep.col.variance', 'rep.col.used', 'rep.col.vsPrevPeriod'],
			rows: categories.map((c) => [
				c.category,
				Number(c.spend.toFixed(2)),
				c.budget ? Number(c.budget.toFixed(2)) : null,
				c.budget ? Number((c.spend - c.budget).toFixed(2)) : null,
				c.budget ? Number(((c.spend / c.budget) * 100).toFixed(2)) : null,
				pctDelta(c.spend, c.prev),
			]),
		},
	};
}

