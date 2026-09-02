export interface DonutSliceInput {
	label: string;
	value: number;
	color: string;
}

export type DonutSlice<T extends DonutSliceInput = DonutSliceInput> = T & {
	pct: number;
	dash: number;
	offset: number;
};

export interface DonutResult<T extends DonutSliceInput = DonutSliceInput> {
	slices: DonutSlice<T>[];
	total: number;
}

export function computeDonutSlices<T extends DonutSliceInput>(
	input: T[],
	radius: number,
): DonutResult<T> {
	const positive = input.filter(s => s.value > 0);
	const total = positive.reduce((sum, s) => sum + s.value, 0);
	if (total <= 0 || radius <= 0) return { slices: [], total: 0 };

	const circumference = 2 * Math.PI * radius;
	let cursor = 0;
	const slices: DonutSlice<T>[] = positive.map(s => {
		const pct = s.value / total;
		const dash = pct * circumference;
		const slice = { ...s, pct, dash, offset: cursor };
		cursor += dash;
		return slice;
	});
	return { slices, total };
}

export function donutSeparatorAngleRad(offset: number, circumference: number): number {
	if (circumference <= 0) return 0;
	return (offset / circumference) * 2 * Math.PI;
}

export function donutSeparatorPoint(
	cx: number,
	cy: number,
	radius: number,
	angleRad: number,
): { x: number; y: number } {
	return { x: cx + radius * Math.cos(angleRad), y: cy + radius * Math.sin(angleRad) };
}
