import { t, ti } from '$lib/i18n';
import { fmtDateShort } from '$lib/formatters';
import type { Locale } from '$lib/i18n-messages';

export interface SupplierCadenceView {
	frequency: string;
	median_gap: number;
	expected_by: string;
	days_late: number;
	late: boolean;
}

const FREQUENCY_KEYS: Record<string, string> = {
	weekly: 'sup.cadence.weekly',
	biweekly: 'sup.cadence.biweekly',
	monthly: 'sup.cadence.monthly',
};

export function cadenceFrequencyLabel(c: SupplierCadenceView): string {
	const key = FREQUENCY_KEYS[c.frequency];
	return key ? t(key) : ti('sup.cadence.periodic', { days: Math.round(c.median_gap) });
}

export function cadenceStatusLabel(c: SupplierCadenceView, locale: Locale): string {
	return c.late
		? ti('sup.cadence.late', { days: c.days_late })
		: ti('sup.cadence.due', { date: fmtDateShort(c.expected_by, locale) });
}

export function cadenceLabel(c: SupplierCadenceView, locale: Locale): string {
	return `${cadenceFrequencyLabel(c)} · ${cadenceStatusLabel(c, locale)}`;
}
