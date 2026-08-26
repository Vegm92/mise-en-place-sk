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

export function fmtEur(n: number): string {
	return EUR_FMT.format(n) + ' €';
}

export function fmtEurCompact(n: number): string {
	return Math.round(n).toLocaleString('es-ES') + ' €';
}

export function fmtEurSigned(n: number): string {
	const rounded = Math.round(n);
	const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
	return sign + fmtEurCompact(Math.abs(rounded));
}

const BUDGET_WARN_PCT = 80;
const BUDGET_OVER_PCT = 100;

export function semColor(pct: number): string {
	if (pct < BUDGET_WARN_PCT) return 'var(--mep-pos)';
	if (pct <= BUDGET_OVER_PCT) return 'var(--mep-warn)';
	return 'var(--mep-neg)';
}

export function fmtDate(d: string | null, locale = 'es-ES'): string {
	if (!d) return '—';
	return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateShort(d: string | null, locale = 'es-ES'): string {
	if (!d) return '—';
	return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

export function initials(name: string): string {
	return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function toMonthStr(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(ym: string, delta: number): string {
	let year = parseInt(ym.slice(0, 4), 10);
	let month = parseInt(ym.slice(5, 7), 10) + delta;
	while (month <= 0) { month += 12; year--; }
	while (month > 12) { month -= 12; year++; }
	return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthParam(param: string | null, currentMonth: string): string {
	if (!param) return currentMonth;
	if (!/^\d{4}-\d{2}$/.test(param)) return currentMonth;
	const month = parseInt(param.slice(5, 7), 10);
	if (month < 1 || month > 12) return currentMonth;
	return param > currentMonth ? currentMonth : param;
}
