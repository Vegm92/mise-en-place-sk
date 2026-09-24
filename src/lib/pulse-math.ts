export function sparkPath(values: (number | null)[], w = 100, h = 28): string | null {
	if (values.length < 2) return null;

	let min = Infinity;
	let max = -Infinity;
	let count = 0;

	for (let i = 0; i < values.length; i++) {
		const v = values[i];
		if (v !== null && v !== undefined && Number.isFinite(v)) {
			if (v < min) min = v;
			if (v > max) max = v;
			count++;
		}
	}

	if (count < 2) return null;

	const span = max - min || 1;
	const step = w / (values.length - 1);
	let d = '';

	for (let i = 0; i < values.length; i++) {
		const v = values[i];
		if (v === null || v === undefined || !Number.isFinite(v)) continue;
		const x = i * step;
		const y = h - ((v - min) / span) * h;
		d += (d ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y.toFixed(2);
	}

	return d;
}

export function windowAvg(values: (number | null)[], fromEnd: number, len: number): number | null {
	const endIdx = values.length - fromEnd;
	const startIdx = Math.max(0, endIdx - len);
	let sum = 0;
	let count = 0;
	for (let i = startIdx; i < endIdx; i++) {
		const v = values[i];
		if (v !== null && v !== undefined && Number.isFinite(v)) {
			sum += v;
			count++;
		}
	}
	return count > 0 ? sum / count : null;
}

export interface Delta {
	pp: number;
	up: boolean;
}

export function delta(now: number | null, prev: number | null): Delta | null {
	if (now === null || prev === null) return null;
	return { pp: (now - prev) * 100, up: now >= prev };
}

export type StatusTier = 'good' | 'warn' | 'bad';

export function statusTier(value: number | null, good: number, warn: number, higherIsBetter: boolean): StatusTier | null {
	if (value === null) return null;
	const isGood = higherIsBetter ? value >= good : value <= good;
	if (isGood) return 'good';
	const isWarn = higherIsBetter ? value >= warn : value <= warn;
	return isWarn ? 'warn' : 'bad';
}
