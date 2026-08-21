import type { PeriodKey } from './period';

export type BucketUnit = 'hour' | 'day' | 'month';

/** `null` for 'all' — no previous period, so no comparable series to bucket. */
export function bucketUnitFor(period: PeriodKey): BucketUnit | null {
	switch (period) {
		case 'day':   return 'hour';
		case 'month': return 'day';
		case 'year':  return 'month';
		case 'all':   return null;
	}
}

function bucketsBetween(from: Date, to: Date, unit: BucketUnit): number {
	if (unit === 'hour') return Math.max(1, Math.round((to.getTime() - from.getTime()) / 3_600_000));
	if (unit === 'day')  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
	return Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
}

function bucketIndex(date: Date, origin: Date, unit: BucketUnit): number {
	if (unit === 'hour') return Math.floor((date.getTime() - origin.getTime()) / 3_600_000);
	if (unit === 'day')  return Math.floor((date.getTime() - origin.getTime()) / 86_400_000);
	return (date.getFullYear() - origin.getFullYear()) * 12 + (date.getMonth() - origin.getMonth());
}

/**
 * Bucketiza importes por fecha en dos series alineadas por índice: el
 * periodo actual (parcial, hasta ahora) y el periodo anterior completo —
 * mismo criterio que period.ts usa para el delta %, para poder dibujarlas
 * superpuestas en el gráfico comparativo de un KpiCard.
 */
export function bucketSeries(
	rows: Array<{ createdAt: Date; amount: number }>,
	period: PeriodKey,
	from: Date | null,
	prevFrom: Date | null,
	prevTo: Date | null,
	now: Date = new Date(),
): { current: number[]; previous: number[] } | null {
	const unit = bucketUnitFor(period);
	if (!unit || !from || !prevFrom || !prevTo) return null;

	const currentLen  = bucketsBetween(from, now, unit);
	const previousLen = bucketsBetween(prevFrom, prevTo, unit);

	const current = new Array(currentLen).fill(0) as number[];
	const previous = new Array(previousLen).fill(0) as number[];

	for (const row of rows) {
		if (row.createdAt >= from) {
			const i = bucketIndex(row.createdAt, from, unit);
			if (i >= 0 && i < current.length) current[i] += row.amount;
		} else if (row.createdAt >= prevFrom) {
			const i = bucketIndex(row.createdAt, prevFrom, unit);
			if (i >= 0 && i < previous.length) previous[i] += row.amount;
		}
	}

	return { current, previous };
}
