const DAYS: Record<string, number> = { '24h': 0, '1w': 6, '1m': 29, '3m': 89, '6m': 179, '1y': 364 };

export function periodRange(urlOrPeriod: URL | string): { rangeFrom: string; rangeTo: string; activePeriod: string } {
	const p = typeof urlOrPeriod === 'string'
		? urlOrPeriod
		: (urlOrPeriod.searchParams.get('period') ?? '1m');
	const today = new Date();
	const to = today.toISOString().slice(0, 10);
	const from = p === 'all' ? '2000-01-01'
		: new Date(today.getTime() - (DAYS[p] ?? 29) * 86400000).toISOString().slice(0, 10);
	return { rangeFrom: from, rangeTo: to, activePeriod: p };
}
