interface PriceChangeRow {
	change_pct: number | null;
}

export function sortPriceRowsRisesFirst<T extends PriceChangeRow>(rows: T[]): T[] {
	return [...rows].sort((a, b) => {
		const aRise = a.change_pct !== null && a.change_pct > 0;
		const bRise = b.change_pct !== null && b.change_pct > 0;
		if (aRise !== bRise) return aRise ? -1 : 1;
		if (aRise && bRise) return (b.change_pct as number) - (a.change_pct as number);
		const aAbs = a.change_pct !== null ? Math.abs(a.change_pct) : -1;
		const bAbs = b.change_pct !== null ? Math.abs(b.change_pct) : -1;
		return bAbs - aAbs;
	});
}
