export function sparkPath(values: (number | null)[], w = 100, h = 28): string | null {
	const clean = values.filter((v): v is number => v !== null);
	if (clean.length < 2) return null;
	const min = Math.min(...clean);
	const max = Math.max(...clean);
	const span = max - min || 1;
	const step = w / (values.length - 1);
	let d = '';
	values.forEach((v, i) => {
		if (v === null) return;
		const x = i * step;
		const y = h - ((v - min) / span) * h;
		d += (d ? ' L ' : 'M ') + x.toFixed(2) + ' ' + y.toFixed(2);
	});
	return d;
}

export function windowAvg(values: (number | null)[], fromEnd: number, len: number): number | null {
	const slice = values
		.slice(Math.max(0, values.length - fromEnd - len), values.length - fromEnd)
		.filter((v): v is number => v !== null);
	if (!slice.length) return null;
	return slice.reduce((a, b) => a + b, 0) / slice.length;
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
