import type { Locale } from './i18n';
export type { Locale } from './i18n';

export function fmt(n: number | null | undefined): string {
	return (n ?? 0).toFixed(2);
}

export function truncate(str: string, len: number): string {
	return str.length > len ? str.slice(0, len) + '…' : str;
}

export function str(val: unknown): string {
	if (val === null || val === undefined) return '';
	return String(val);
}

const INTL_LOCALE: Record<Locale, string> = {
	es: 'es-ES',
	en: 'en-GB',
};

export function toIntlLocale(locale: Locale): string {
	return INTL_LOCALE[locale] ?? INTL_LOCALE.es;
}

const INTEGER_OPTS: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
const ONE_DECIMAL_OPTS: Intl.NumberFormatOptions = {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
};
const EUR_OPTS: Intl.NumberFormatOptions = { style: 'currency', currency: 'EUR' };
const EUR_COMPACT_OPTS: Intl.NumberFormatOptions = {
	style: 'currency',
	currency: 'EUR',
	maximumFractionDigits: 0,
};
const YOY_OPTS: Intl.NumberFormatOptions = {
	maximumFractionDigits: 1,
	signDisplay: 'exceptZero',
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
	day: '2-digit',
	month: 'short',
	year: 'numeric',
};
const DATE_SHORT_OPTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
const MONTH_SHORT_OPTS: Intl.DateTimeFormatOptions = { month: 'short' };

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

const eurFormatters: Record<Locale, Intl.NumberFormat> = {
	es: new Intl.NumberFormat('es-ES', EUR_OPTS),
	en: new Intl.NumberFormat('en-GB', EUR_OPTS),
};

const eurCompactFormatters: Record<Locale, Intl.NumberFormat> = {
	es: new Intl.NumberFormat('es-ES', EUR_COMPACT_OPTS),
	en: new Intl.NumberFormat('en-GB', EUR_COMPACT_OPTS),
};

const yoyFormatters: Record<Locale, Intl.NumberFormat> = {
	es: new Intl.NumberFormat('es-ES', YOY_OPTS),
	en: new Intl.NumberFormat('en-GB', YOY_OPTS),
};

const integerFormatters: Record<Locale, Intl.NumberFormat> = {
	es: new Intl.NumberFormat('es-ES', INTEGER_OPTS),
	en: new Intl.NumberFormat('en-GB', INTEGER_OPTS),
};

const oneDecimalFormatters: Record<Locale, Intl.NumberFormat> = {
	es: new Intl.NumberFormat('es-ES', ONE_DECIMAL_OPTS),
	en: new Intl.NumberFormat('en-GB', ONE_DECIMAL_OPTS),
};

const dateFormatters: Record<Locale, Intl.DateTimeFormat> = {
	es: new Intl.DateTimeFormat('es-ES', DATE_OPTS),
	en: new Intl.DateTimeFormat('en-GB', DATE_OPTS),
};

const dateShortFormatters: Record<Locale, Intl.DateTimeFormat> = {
	es: new Intl.DateTimeFormat('es-ES', DATE_SHORT_OPTS),
	en: new Intl.DateTimeFormat('en-GB', DATE_SHORT_OPTS),
};

const monthShortFormatters: Record<Locale, Intl.DateTimeFormat> = {
	es: new Intl.DateTimeFormat('es-ES', MONTH_SHORT_OPTS),
	en: new Intl.DateTimeFormat('en-GB', MONTH_SHORT_OPTS),
};

function getNumberFormatter(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
	const intlLoc = toIntlLocale(locale);
	const key = `${intlLoc}:${JSON.stringify(options)}`;
	let fmtInstance = numberFormatters.get(key);
	if (!fmtInstance) {
		fmtInstance = new Intl.NumberFormat(intlLoc, options);
		numberFormatters.set(key, fmtInstance);
	}
	return fmtInstance;
}

function getDateTimeFormatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const intlLoc = toIntlLocale(locale);
	const key = `${intlLoc}:${JSON.stringify(options)}`;
	let fmtInstance = dateTimeFormatters.get(key);
	if (!fmtInstance) {
		fmtInstance = new Intl.DateTimeFormat(intlLoc, options);
		dateTimeFormatters.set(key, fmtInstance);
	}
	return fmtInstance;
}

export function fmtSize(bytes: number, locale: Locale = 'es'): string {
	const fmtInt = integerFormatters[locale] ?? integerFormatters.es;
	const fmtDec = oneDecimalFormatters[locale] ?? oneDecimalFormatters.es;
	if (bytes < 1024) return fmtInt.format(bytes) + ' B';
	if (bytes < 1024 * 1024) return fmtDec.format(bytes / 1024) + ' KB';
	return fmtDec.format(bytes / (1024 * 1024)) + ' MB';
}

export function fmtEur(n: number, locale: Locale = 'es'): string {
	const fmtInst = eurFormatters[locale] ?? eurFormatters.es;
	return fmtInst.format(n);
}

export function fmtEurCompact(n: number, locale: Locale = 'es'): string {
	const fmtInst = eurCompactFormatters[locale] ?? eurCompactFormatters.es;
	return fmtInst.format(Math.round(n));
}

export function fmtEurSigned(n: number, locale: Locale = 'es'): string {
	const rounded = Math.round(n);
	let sign = '';
	if (rounded > 0) sign = '+';
	else if (rounded < 0) sign = '−';
	return sign + fmtEurCompact(Math.abs(rounded), locale);
}

export function formatYoyPct(pct: number | null, locale: Locale = 'es'): string {
	if (pct === null || !Number.isFinite(pct)) return '—';
	const fmtInst = yoyFormatters[locale] ?? yoyFormatters.es;
	return fmtInst.format(pct) + ' %';
}

const BUDGET_WARN_PCT = 80;
const BUDGET_OVER_PCT = 100;

export function semColor(pct: number): string {
	if (pct < BUDGET_WARN_PCT) return 'var(--mep-pos)';
	if (pct <= BUDGET_OVER_PCT) return 'var(--mep-warn)';
	return 'var(--mep-neg)';
}

export function fmtDate(d: string | null, locale: Locale = 'es'): string {
	if (!d) return '—';
	const fmtInst = dateFormatters[locale] ?? dateFormatters.es;
	return fmtInst.format(new Date(d));
}

export function fmtDateShort(d: string | null, locale: Locale = 'es'): string {
	if (!d) return '—';
	const fmtInst = dateShortFormatters[locale] ?? dateShortFormatters.es;
	return fmtInst.format(new Date(d));
}

export function fmtMonthShort(ym: string, locale: Locale = 'es'): string {
	const fmtInst = monthShortFormatters[locale] ?? monthShortFormatters.es;
	return fmtInst.format(new Date(`${ym}-01T00:00:00`));
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
