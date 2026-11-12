export type SampleSupplier = 'A' | 'B';

export interface SampleDelivery {
	supplier: SampleSupplier;
	date: string;
	litres: number;
	pricePerLitre: number;
}

export const SAMPLE_DELIVERIES: readonly SampleDelivery[] = [
	{ supplier: 'A', date: '2026-07-06', litres: 30, pricePerLitre: 8.24 },
	{ supplier: 'A', date: '2026-07-13', litres: 30, pricePerLitre: 8.24 },
	{ supplier: 'B', date: '2026-07-15', litres: 10, pricePerLitre: 8.31 },
	{ supplier: 'A', date: '2026-07-20', litres: 30, pricePerLitre: 8.24 },
	{ supplier: 'A', date: '2026-07-27', litres: 30, pricePerLitre: 8.24 },
	{ supplier: 'A', date: '2026-08-03', litres: 30, pricePerLitre: 8.24 },
	{ supplier: 'A', date: '2026-08-10', litres: 30, pricePerLitre: 8.24 },
	{ supplier: 'B', date: '2026-08-12', litres: 10, pricePerLitre: 8.29 },
	{ supplier: 'A', date: '2026-08-17', litres: 30, pricePerLitre: 8.48 },
];

export const SAMPLE_PERIOD = { from: '2026-08-01', to: '2026-08-17' } as const;
export const SAMPLE_ALERT_THRESHOLD = 0.02;

export interface SampleAlert {
	supplier: SampleSupplier;
	referencePrice: number;
	latestPrice: number;
	deviationPct: number;
	extraPaid: number;
	lastDate: string;
	alternative: { supplier: SampleSupplier; price: number; asOf: string } | null;
}

export interface ChartBox {
	width: number;
	height: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export interface ChartPoint {
	x: number;
	y: number;
	delivery: SampleDelivery;
}

export interface SampleChart {
	box: ChartBox;
	points: ChartPoint[];
	stepPath: string;
	ticks: { y: number; value: number }[];
	baseline: number;
}

export const CHART_BOX: ChartBox = { width: 360, height: 160, left: 52, right: 60, top: 14, bottom: 28 };

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function sampleChart(deliveries: readonly SampleDelivery[], stepSupplier: SampleSupplier, box: ChartBox = CHART_BOX): SampleChart {
	const sorted = [...deliveries].sort((a, b) => a.date.localeCompare(b.date));
	const times = sorted.map((d) => Date.parse(d.date));
	const prices = sorted.map((d) => d.pricePerLitre);
	const t0 = Math.min(...times);
	const span = Math.max(...times) - t0 || 1;
	const lo = Math.floor(Math.min(...prices) * 10) / 10;
	const hi = Math.ceil(Math.max(...prices) * 10) / 10;
	const range = hi - lo || 1;
	const plotW = box.width - box.left - box.right;
	const plotH = box.height - box.top - box.bottom;
	const yOf = (p: number) => round1(box.top + ((hi - p) / range) * plotH);

	const points = sorted.map((delivery, i) => ({
		x: round1(box.left + ((times[i]! - t0) / span) * plotW),
		y: yOf(delivery.pricePerLitre),
		delivery,
	}));

	const step = points.filter((p) => p.delivery.supplier === stepSupplier);
	const stepPath = step
		.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `H${p.x} V${p.y}`))
		.join(' ');

	return {
		box,
		points,
		stepPath,
		ticks: [hi, (lo + hi) / 2, lo].map((value) => ({ y: yOf(value), value })),
		baseline: box.top + plotH,
	};
}
