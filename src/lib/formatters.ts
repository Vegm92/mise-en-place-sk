export function fmt(n: number | null | undefined): string {
	return (n ?? 0).toFixed(2);
}

export function truncate(str: string, len: number): string {
	return str.length > len ? str.slice(0, len) + '…' : str;
}

export function fmtSize(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function str(val: unknown): string {
	if (val === null || val === undefined) return '';
	return String(val);
}

const EUR_FMT = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Full precision EUR: 1234.56 → "1.234,56 €" */
export function fmtEur(n: number): string {
	return EUR_FMT.format(n) + ' €';
}

/** Rounded EUR: 1234.56 → "1.235 €" */
export function fmtEurCompact(n: number): string {
	return Math.round(n).toLocaleString('es-ES') + ' €';
}

// Matches the budget_warning_threshold default in the settings table (80 %).
const BUDGET_WARN_PCT = 80;
const BUDGET_OVER_PCT = 100;

/** Traffic-light color for a budget percentage (0-100+). */
export function semColor(pct: number): string {
	if (pct < BUDGET_WARN_PCT) return 'var(--mep-pos)';
	if (pct <= BUDGET_OVER_PCT) return 'var(--mep-warn)';
	return 'var(--mep-neg)';
}

/** Full date with year: "19 may 2024" */
export function fmtDate(d: string | null, locale = 'es-ES'): string {
	if (!d) return '—';
	return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Short date without year: "19 may" */
export function fmtDateShort(d: string | null, locale = 'es-ES'): string {
	if (!d) return '—';
	return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

/** "AB" initials from a name */
export function initials(name: string): string {
	return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/** "2024-05" from a Date */
export function toMonthStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Shift a "YYYY-MM" string by delta months */
export function shiftMonth(ym: string, delta: number): string {
	let year = parseInt(ym.slice(0, 4), 10);
	let month = parseInt(ym.slice(5, 7), 10) + delta;
	while (month <= 0) { month += 12; year--; }
	while (month > 12) { month -= 12; year++; }
	return `${year}-${String(month).padStart(2, '0')}`;
}
