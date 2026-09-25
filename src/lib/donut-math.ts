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
	if (radius <= 0 || input.length === 0) return { slices: [], total: 0 };

	let total = 0;
	for (let i = 0; i < input.length; i++) {
		const val = input[i]!.value;
		if (val > 0) total += val;
	}
	if (total <= 0) return { slices: [], total: 0 };

	const circumference = 2 * Math.PI * radius;
	const invTotal = 1 / total;
	let cursor = 0;
	const slices: DonutSlice<T>[] = [];

	for (let i = 0; i < input.length; i++) {
		const s = input[i]!;
		if (s.value <= 0) continue;
		const pct = s.value * invTotal;
		const dash = pct * circumference;
		slices.push({ ...s, pct, dash, offset: cursor });
		cursor += dash;
	}

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
