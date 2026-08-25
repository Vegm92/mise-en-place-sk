import { db, forTenant } from '$lib/server/db';
import { settings } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';
import type { Cell, ReportDoc } from '$lib/reports';
import { fmtPct, fmtPlainPct, generatedStamp, money } from './shared';

const DEFAULT_THRESHOLD = 0.15;
const TABLE_LIMIT = 24;
const CHART_LIMIT = 6;

type SnapshotRow = {
	description: string;
	supplier_name: string;
	unit: string | null;
	latest_date: string;
	latest_price: number | string;
	prev_price: number | string | null;
	prev_date: string | null;
	change_pct: number | string | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function buildPrices(rid: string, month: string, now: Date): Promise<ReportDoc> {
	const tdb = forTenant(rid);
	const [rawRows, thresholdRows] = await Promise.all([
		db.execute<SnapshotRow>(sql`
			SELECT description, supplier_name, unit, latest_date, latest_price, prev_price, prev_date, change_pct
			FROM mv_price_snapshots
			WHERE restaurant_id = ${rid}
			ORDER BY ABS(COALESCE(change_pct, 0)) DESC
		`),
		db.select({ value: settings.value })
			.from(settings)
			.where(tdb.scope(settings.restaurantId, eq(settings.key, 'price_alert_threshold'))),
	]);

	const thresholdPct = (thresholdRows[0] ? parseFloat(thresholdRows[0].value) : DEFAULT_THRESHOLD) * 100;

	const items = rawRows.map((r) => ({
		description: String(r.description),
		supplier: String(r.supplier_name ?? '—'),
		unit: r.unit ?? null,
		latest: Number(r.latest_price),
		prev: num(r.prev_price),
		change: num(r.change_pct),
		latestDate: String(r.latest_date).slice(0, 10),
		prevDate: r.prev_date ? String(r.prev_date).slice(0, 10) : null,
	}));

	const changed = items.filter((i) => i.change !== null);
	const increases = changed.filter((i) => i.change! > 0);
	const decreases = changed.filter((i) => i.change! < 0);
	const overThreshold = changed.filter((i) => Math.abs(i.change!) >= thresholdPct);
	const topRises = [...increases].sort((a, b) => b.change! - a.change!);
	const maxRise = topRises[0]?.change ?? 0;

	const shown = changed.slice(0, TABLE_LIMIT);

	const changeCell = (change: number | null): Cell =>
		change === null ? '—' : { v: fmtPct(change), tone: change > 0 ? 'up' : 'down' };

	const rows: Record<string, Cell>[] = shown.map((i) => ({
		product: i.description,
		supplier: i.supplier,
		prev: i.prev === null ? '—' : money(i.prev),
		latest: money(i.latest),
		change: changeCell(i.change),
	}));

	return {
		type: 'prices',
		heading: 'rep.prices.heading',
		eyebrow: 'rep.prices.eyebrow',
		subheading: {
			key: 'rep.prices.subheading',
			vars: { count: items.length, threshold: fmtPlainPct(thresholdPct, 0) },
		},
		periodIso: month,
		generatedAt: generatedStamp(now),
		kpis: [
			{ label: 'rep.kpi.itemsTracked', value: String(items.length), note: 'rep.kpi.itemsTrackedNote', tone: null },
			{ label: 'rep.kpi.increases', value: String(increases.length), note: null, tone: increases.length ? 'up' : null },
			{ label: 'rep.kpi.decreases', value: String(decreases.length), note: null, tone: decreases.length ? 'down' : null },
			{ label: 'rep.kpi.overThreshold', value: String(overThreshold.length), note: { key: 'rep.kpi.overThresholdNote', vars: { threshold: fmtPlainPct(thresholdPct, 0) } }, tone: overThreshold.length ? 'warn' : null },
		],
		summary: null,
		chartTitle: 'rep.chart.biggestRises',
		chartNote: 'rep.chart.vsPrevPrice',
		bars: topRises.slice(0, CHART_LIMIT).map((i) => ({
			label: i.description,
			value: fmtPct(i.change),
			pct: maxRise ? Math.round((i.change! / maxRise) * 100) : 0,
			color: 'var(--mep-acc)',
			muted: false,
		})),
		tableTitle: 'rep.table.priceMoves',
		columns: [
			{ key: 'product', label: 'rep.col.product', numeric: false },
			{ key: 'supplier', label: 'rep.col.supplier', numeric: false },
			{ key: 'prev', label: 'rep.col.prevPrice', numeric: true },
			{ key: 'latest', label: 'rep.col.latestPrice', numeric: true },
			{ key: 'change', label: 'rep.col.change', numeric: true },
		],
		rows,
		total: null,
		empty: items.length === 0,
		csv: {
			filename: `variacion-precios-${month}.csv`,
			header: ['rep.col.product', 'rep.col.supplier', 'rep.col.unit', 'rep.col.prevDate', 'rep.col.prevPrice', 'rep.col.latestDate', 'rep.col.latestPrice', 'rep.col.change'],
			rows: items.map((i) => [
				i.description,
				i.supplier,
				i.unit,
				i.prevDate,
				i.prev,
				i.latestDate,
				Number(i.latest.toFixed(2)),
				i.change,
			]),
		},
	};
}
