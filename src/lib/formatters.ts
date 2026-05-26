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
