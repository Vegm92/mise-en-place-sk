const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toIsoDate(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim();
	if (raw === '') return null;

	const m = ISO_DATE.exec(raw);
	if (!m) return null;

	const [, y, mo, d] = m;
	const year = Number(y);
	const month = Number(mo);
	const day = Number(d);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;

	const parsed = new Date(Date.UTC(year, month - 1, day));
	if (
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== day
	) return null;

	return raw;
}
