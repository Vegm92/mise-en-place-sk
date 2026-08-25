import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { moneyToNumber } from '$lib/server/money';
import type { Cell, ReportDoc } from '$lib/reports';
import { generatedStamp, money, moneyPlain } from './shared';

const BUCKETS = [
	{ key: 'rep.bucket.notDue', min: -Infinity, max: -1, shade: 0.18 },
	{ key: 'rep.bucket.d0', min: 0, max: 30, shade: 0.38 },
	{ key: 'rep.bucket.d31', min: 31, max: 60, shade: 0.62 },
	{ key: 'rep.bucket.d61', min: 61, max: Infinity, shade: 0.9 },
] as const;

const TABLE_LIMIT = 30;

type PayableRow = {
	supplier: string | null;
	invoice_number: string | null;
	invoice_date: string | null;
	due_date: string | null;
	total_amount: string | null;
	days_overdue: number | string | null;
}

function bucketIndex(days: number): number {
	for (let i = 0; i < BUCKETS.length; i++) {
		const b = BUCKETS[i]!;
		if (days >= b.min && days <= b.max) return i;
	}
	return BUCKETS.length - 1;
}

export async function buildPayables(rid: string, today: string, now: Date): Promise<ReportDoc> {
	const rows = await db.execute<PayableRow>(sql`
		SELECT
			s.name              AS supplier,
			i.invoice_number    AS invoice_number,
			i.invoice_date::text AS invoice_date,
			i.due_date::text    AS due_date,
			i.total_amount      AS total_amount,
			(${today}::date - i.due_date) AS days_overdue
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		WHERE i.restaurant_id = ${rid}
		  AND i.deleted_at IS NULL
		  AND i.due_date IS NOT NULL
		  AND i.status <> 'paid'
		ORDER BY i.due_date ASC
	`);

	const items = rows.map((r) => {
		const days = Number(r.days_overdue ?? 0);
		return {
			supplier: r.supplier ?? '—',
			number: r.invoice_number ?? '—',
			due: r.due_date ? String(r.due_date).slice(0, 10) : '',
			invoiceDate: r.invoice_date ? String(r.invoice_date).slice(0, 10) : '',
			amount: moneyToNumber(r.total_amount),
			days,
			bucket: bucketIndex(days),
		};
	});

	const total = items.reduce((s, i) => s + i.amount, 0);
	const overdue = items.filter((i) => i.days >= 0);
	const overdueTotal = overdue.reduce((s, i) => s + i.amount, 0);
	const dueSoon = items.filter((i) => i.days < 0 && i.days >= -7);
	const dueSoonTotal = dueSoon.reduce((s, i) => s + i.amount, 0);
	const supplierCount = new Set(items.map((i) => i.supplier)).size;

	const bucketTotals = BUCKETS.map((_, idx) => items.filter((i) => i.bucket === idx).reduce((s, i) => s + i.amount, 0));
	const maxBucket = Math.max(...bucketTotals, 0) || 1;

	const daysCell = (days: number): Cell => {
		if (days < 0) return { v: String(-days), tone: 'muted' };
		return { v: `+${days}`, tone: days >= 31 ? 'up' : 'warn' };
	};

	const tableRows: Record<string, Cell>[] = items.slice(0, TABLE_LIMIT).map((i) => ({
		supplier: i.supplier,
		number: i.number,
		due: i.due,
		amount: money(i.amount),
		days: daysCell(i.days),
	}));

	return {
		type: 'payables',
		heading: 'rep.payables.heading',
		eyebrow: 'rep.payables.eyebrow',
		subheading: { key: 'rep.payables.subheading', vars: { date: today, count: items.length, suppliers: supplierCount } },
		periodIso: today,
		generatedAt: generatedStamp(now),
		kpis: [
			{ label: 'rep.kpi.outstanding', value: money(total), note: { key: 'rep.kpi.acrossInvoices', vars: { n: items.length } }, tone: null },
			{ label: 'rep.kpi.overdue', value: money(overdueTotal), note: { key: 'rep.kpi.acrossInvoices', vars: { n: overdue.length } }, tone: overdue.length ? 'up' : null },
			{ label: 'rep.kpi.dueSoon', value: money(dueSoonTotal), note: 'rep.kpi.dueSoonNote', tone: dueSoon.length ? 'warn' : null },
			{ label: 'rep.kpi.suppliers', value: String(supplierCount), note: 'rep.kpi.suppliersNote', tone: null },
		],
		summary: null,
		chartTitle: 'rep.chart.ageing',
		chartNote: 'rep.chart.byDueDate',
		bars: BUCKETS.map((b, idx) => ({
			label: b.key,
			value: moneyPlain(bucketTotals[idx]!),
			pct: Math.round((bucketTotals[idx]! / maxBucket) * 100),
			color: `color-mix(in oklab, var(--mep-fg) ${Math.round(b.shade * 100)}%, var(--mep-surface))`,
			muted: false,
		})),
		tableTitle: 'rep.table.openInvoices',
		columns: [
			{ key: 'supplier', label: 'rep.col.supplier', numeric: false },
			{ key: 'number', label: 'rep.col.invoiceNumber', numeric: false },
			{ key: 'due', label: 'rep.col.dueDate', numeric: false },
			{ key: 'amount', label: 'rep.col.amount', numeric: true },
			{ key: 'days', label: 'rep.col.daysOverdue', numeric: true },
		],
		rows: tableRows,
		total: {
			supplier: { v: 'rep.total', kind: 'key' },
			number: '',
			due: '',
			amount: money(total),
			days: '',
		},
		empty: items.length === 0,
		csv: {
			filename: `cuentas-pagar-${today}.csv`,
			header: ['rep.col.supplier', 'rep.col.invoiceNumber', 'rep.col.invoiceDate', 'rep.col.dueDate', 'rep.col.amount', 'rep.col.daysOverdue'],
			rows: items.map((i) => [i.supplier, i.number, i.invoiceDate, i.due, Number(i.amount.toFixed(2)), String(i.days)]),
		},
	};
}
