import { toIntlLocale } from './formatters';
import type { Locale } from './i18n';

export const DRIFT_PRESETS = [0.01, 0.02, 0.03] as const;

export const DEFAULT_MONTHLY_SPEND = 20_000;
export const DEFAULT_DRIFT = 0.02;
export const MAX_MONTHLY_SPEND = 100_000_000;
const MONTHS_PER_YEAR = 12;

export interface Stake {
	monthly: number;
	yearly: number;
}

export function parseMonthlySpend(raw: string): number {
	const whole = raw.trim().replace(/[.,]\d{1,2}\s*€?\s*$/, '');
	const digits = whole.replace(/\D/g, '');
	if (!digits) return 0;
	return Math.min(Number(digits), MAX_MONTHLY_SPEND);
}

export function formatSpendInput(amount: number, locale: Locale): string {
	return new Intl.NumberFormat(toIntlLocale(locale), { maximumFractionDigits: 0, useGrouping: 'always' }).format(amount);
}

export function stakeAt(monthlySpend: number, drift: number): Stake {
	const spend = Number.isFinite(monthlySpend) && monthlySpend > 0 ? monthlySpend : 0;
	const rate = Number.isFinite(drift) && drift > 0 ? drift : 0;
	const monthly = spend * rate;
	return { monthly, yearly: monthly * MONTHS_PER_YEAR };
}

export function planShareOfStake(planMonthlyPrice: number, monthlyStake: number): number | null {
	if (!Number.isFinite(monthlyStake) || monthlyStake <= 0) return null;
	if (!Number.isFinite(planMonthlyPrice) || planMonthlyPrice < 0) return null;
	return planMonthlyPrice / monthlyStake;
}

export function formatPct(ratio: number, locale: Locale): string {
	return new Intl.NumberFormat(toIntlLocale(locale), {
		style: 'percent',
		minimumFractionDigits: 0,
		maximumFractionDigits: Math.abs(ratio) < 0.1 ? 1 : 0,
	}).format(ratio);
}
