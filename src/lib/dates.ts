const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isoDateCache = new Map<string, string | null>();
const MAX_CACHE_SIZE = 2000;

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function toIsoDate(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim();
	if (raw === '') return null;

	const cached = isoDateCache.get(raw);
	if (cached !== undefined) return cached;

	let result: string | null = null;
	const m = ISO_DATE.exec(raw);
	if (m) {
		const [, y, mo, d] = m;
		const year = Number(y);
		const month = Number(mo);
		const day = Number(d);

		if (month >= 1 && month <= 12 && day >= 1) {
			const maxDays = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month];
			if (day <= maxDays) {
				result = raw;
			}
		}
	}

	if (isoDateCache.size >= MAX_CACHE_SIZE) {
		isoDateCache.clear();
	}
	isoDateCache.set(raw, result);

	return result;
}
